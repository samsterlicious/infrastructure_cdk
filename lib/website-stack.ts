import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as ssm from '@aws-cdk/aws-ssm';
import * as iam from '@aws-cdk/aws-iam';
import * as route53 from '@aws-cdk/aws-route53';
import * as route53_targets from '@aws-cdk/aws-route53-targets';
export class WebsiteStack extends cdk.Stack {

    distribution: cloudfront.CloudFrontWebDistribution;
    hostedZone: route53.IHostedZone;

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
            comment: "sammy"
        });

        const bucket = new s3.Bucket(this, 'WebsiteBucket', {
            bucketName: 'sammy-website-bucket',
            versioned: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
        });

        bucket.grantRead(originAccessIdentity);

        const policyStatement = new iam.PolicyStatement();
        policyStatement.addActions('s3:GetBucket*');
        policyStatement.addActions('s3:GetObject*');
        policyStatement.addActions('s3:List*');
        policyStatement.addResources(bucket.bucketArn);
        policyStatement.addResources(`${bucket.bucketArn}/*`);
        policyStatement.addCanonicalUserPrincipal(originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId);

        // testBucket.addToResourcePolicy(policyStatement);

        // Manually create or update bucket policy
        if (!bucket.policy) {
            new s3.BucketPolicy(this, 'Policy', { bucket }).document.addStatements(policyStatement);
        } else {
            bucket.policy.document.addStatements(policyStatement);
        }

        const hostedZoneId = ssm.StringParameter.fromStringParameterAttributes(this, 'HostedZoneIdParam', {
            parameterName: 'hosted_zone_id'
        }).stringValue;

        const zoneName = ssm.StringParameter.fromStringParameterAttributes(this, 'ZoneNameParam', {
            parameterName: 'zone_name'
        }).stringValue;

        this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'MyHostedZone', {
            hostedZoneId,
            zoneName,
        });

        const certificate = new acm.Certificate(this, 'Certificate', {
            domainName: 'sammy.link',
            validation: acm.CertificateValidation.fromDns(this.hostedZone),
        });

        this.distribution = new cloudfront.CloudFrontWebDistribution(this, 'WebsiteCloudFront', {
            originConfigs: [{
                s3OriginSource: {
                    s3BucketSource: bucket,
                    originAccessIdentity: originAccessIdentity
                },
                behaviors: [{ isDefaultBehavior: true }],
            }],
            errorConfigurations: [
                {
                    errorCode: 403,
                    responseCode: 200,
                    responsePagePath: '/index.html'
                }],
            viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(
                certificate,
                {
                    aliases: ['sammy.link'],
                    securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1, // default
                    sslMethod: cloudfront.SSLMethod.SNI, // default
                },
            ),
        });

        new route53.ARecord(this, 'AliasRecord', { 
            zone: this.hostedZone,
            target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(this.distribution)),
        });

    }
}
