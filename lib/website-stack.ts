import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as route53 from '@aws-cdk/aws-route53';
import * as cloudfront from '@aws-cdk/aws-cloudfront'; 

export class WebsiteStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const bucket = new s3.Bucket(this, 'WebsiteBucket', {
            versioned: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });

        const hostedZone = new route53.HostedZone(this, 'HostedZone', {
            zoneName: 'sammy.link',
        });

        const certificate = new acm.Certificate(this, 'Certificate', {
            domainName: 'sammy.link',
            validation: acm.CertificateValidation.fromDns(hostedZone),
        });

        new cloudfront.CloudFrontWebDistribution(this, 'WebsiteCloudFront', {
            originConfigs: [{
                s3OriginSource: { s3BucketSource: bucket },
                behaviors: [{ isDefaultBehavior: true }],
            }],
            errorConfigurations: [{
                errorCode: 400,
                responseCode: 200,
                responsePagePath: 'index.html'
            },
            {
                errorCode: 401,
                responseCode: 200,
                responsePagePath: 'index.html'
            },
            {
                errorCode: 404,
                responseCode: 200,
                responsePagePath: 'index.html'
            }],
            viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(
                certificate,
                {
                    aliases: ['sammy.link', 'www.sammy.link'],
                    securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1, // default
                    sslMethod: cloudfront.SSLMethod.SNI, // default
                },
            ),
        });


    }
}
