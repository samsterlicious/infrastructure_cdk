import * as cdk from "@aws-cdk/core";
import * as codepipeline from "@aws-cdk/aws-codepipeline";
import * as codepipeline_actions from "@aws-cdk/aws-codepipeline-actions";
import * as ssm from "@aws-cdk/aws-ssm";
import * as secretsmanager from "@aws-cdk/aws-secretsmanager";
import * as codebuild from "@aws-cdk/aws-codebuild";
import { SecretValue } from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as cognito from "@aws-cdk/aws-cognito";
import * as route53 from "@aws-cdk/aws-route53";
import * as acm from "@aws-cdk/aws-certificatemanager";
import * as route53_targets from "@aws-cdk/aws-route53-targets";

export class InfrastructureCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: InfraProps) {
    super(scope, id, props);

    const { distribution, hostedZone } = props;
    const { oauth, branch, owner, repo, webRepo } = getParameters(this);

    buildInfrastructurePipeline(this, owner, repo, oauth, branch);
    buildWebsitePipeline(this, owner, webRepo, oauth, branch, distribution);

    buildCognito(this, hostedZone);
  }
}

const getParameters = (stack: cdk.Stack): StackParameters => {
  const owner = ssm.StringParameter.fromStringParameterAttributes(
    stack,
    "OwnerParam",
    {
      parameterName: "owner",
    }
  ).stringValue;

  const branch = ssm.StringParameter.fromStringParameterAttributes(
    stack,
    "BranchParam",
    {
      parameterName: "branch",
    }
  ).stringValue;

  const repo = ssm.StringParameter.fromStringParameterAttributes(
    stack,
    "RepoParam",
    {
      parameterName: "repo",
    }
  ).stringValue;

  const webRepo = ssm.StringParameter.fromStringParameterAttributes(
    stack,
    "WebRepoParam",
    {
      parameterName: "web_repo",
    }
  ).stringValue;

  const oauth = secretsmanager.Secret.fromSecretNameV2(
    stack,
    "OauthSecret",
    "oauth-token"
  ).secretValue;

  const webOauth = secretsmanager.Secret.fromSecretNameV2(
    stack,
    "WebOauthSecret",
    "web-oauth-token"
  ).secretValue;

  return {
    owner,
    branch,
    repo,
    oauth,
    webRepo,
  };
};

type StackParameters = {
  owner: string;
  branch: string;
  repo: string;
  oauth: SecretValue;
  webRepo: string;
};

const buildInfrastructurePipeline = (
  stack: cdk.Stack,
  owner: string,
  repo: string,
  oauth: SecretValue,
  branch: string
) => {
  const sourceOutput = new codepipeline.Artifact();
  const cdkBuildOutput = new codepipeline.Artifact();

  const cdkBuild = new codebuild.PipelineProject(stack, "CdkBuild", {
    buildSpec: codebuild.BuildSpec.fromObject({
      version: "0.2",
      phases: {
        install: {
          commands: "npm install",
        },
        build: {
          commands: ["npm run build", "npm run cdk synth -- -o dist"],
        },
      },
      artifacts: {
        "base-directory": "dist",
        files: [
          "InfrastructureCdkStack.template.json",
          "WebsiteCdkStack.template.json",
        ],
      },
    }),
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
    },
  });

  new codepipeline.Pipeline(stack, "InfrastructurePipeline", {
    pipelineName: "InfrastructurePipeline",
    crossAccountKeys: false,
    stages: [
      {
        stageName: "Source",
        actions: [
          new codepipeline_actions.GitHubSourceAction({
            actionName: "GitHub_Source",
            owner,
            repo,
            oauthToken: oauth,
            output: sourceOutput,
            branch,
          }),
        ],
      },
      {
        stageName: "Build",
        actions: [
          new codepipeline_actions.CodeBuildAction({
            actionName: "CDK_Build",
            project: cdkBuild,
            input: sourceOutput,
            outputs: [cdkBuildOutput],
          }),
        ],
      },
      {
        stageName: "Deploy",
        actions: [
          new codepipeline_actions.CloudFormationCreateUpdateStackAction({
            actionName: "Pipeline",
            templatePath: cdkBuildOutput.atPath(
              "InfrastructureCdkStack.template.json"
            ),
            stackName: "InfrastructureCdkStack",
            adminPermissions: true,
          }),
          new codepipeline_actions.CloudFormationCreateUpdateStackAction({
            actionName: "Website",
            templatePath: cdkBuildOutput.atPath(
              "WebsiteCdkStack.template.json"
            ),
            stackName: "WebsiteCdkStack",
            adminPermissions: true,
          }),
        ],
      },
    ],
  });
};

const buildWebsitePipeline = (
  stack: cdk.Stack,
  owner: string,
  repo: string,
  oauth: SecretValue,
  branch: string,
  distribution: cloudfront.CloudFrontWebDistribution
) => {
  const sourceOutput = new codepipeline.Artifact();
  const angularOutput = new codepipeline.Artifact();

  const targetBucket = s3.Bucket.fromBucketName(
    stack,
    "WebTargetBucket",
    "sammy-website-bucket"
  );

  const cdkBuild = new codebuild.PipelineProject(stack, "WebProject", {
    buildSpec: codebuild.BuildSpec.fromObject({
      version: "0.2",
      phases: {
        install: {
          commands: ["npm install", "pip install awscli --upgrade --user"],
        },
        build: {
          commands: ["npm run build"],
        },
      },
      artifacts: {
        files: ["**/*"],
        "base-directory": "dist/sammy",
        "discard-paths": "yes",
      },
    }),
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
    },
  });

  const invalidateBuildProject = new codebuild.PipelineProject(
    stack,
    `InvalidateProject`,
    {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              'aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/*"',
            ],
          },
        },
      }),
      environmentVariables: {
        CLOUDFRONT_ID: { value: distribution.distributionId },
      },
    }
  );

  new codepipeline.Pipeline(stack, "WebCodePipeline", {
    pipelineName: "WebPipeline",
    crossAccountKeys: false,
    stages: [
      {
        stageName: "Source",
        actions: [
          new codepipeline_actions.GitHubSourceAction({
            actionName: "GitHub_Source",
            owner,
            repo,
            oauthToken: oauth,
            output: sourceOutput,
            branch,
          }),
        ],
      },
      {
        stageName: "Build",
        actions: [
          new codepipeline_actions.CodeBuildAction({
            actionName: "Build",
            project: cdkBuild,
            input: sourceOutput,
            outputs: [angularOutput],
          }),
        ],
      },
      {
        stageName: "Deploy",
        actions: [
          new codepipeline_actions.S3DeployAction({
            actionName: "S3Deploy",
            bucket: targetBucket,
            input: angularOutput,
            runOrder: 1,
          }),
          new codepipeline_actions.CodeBuildAction({
            actionName: "InvalidateCache",
            project: invalidateBuildProject,
            input: angularOutput,
            runOrder: 2,
          }),
        ],
      },
    ],
  });
};

const buildCognito = (stack: cdk.Stack, hostedZone: route53.IHostedZone) => {
  const clientId = ssm.StringParameter.fromStringParameterAttributes(
    stack,
    "ClientIdParam",
    {
      parameterName: "client_id",
    }
  ).stringValue;

  const clientSecret = ssm.StringParameter.fromStringParameterAttributes(
    stack,
    "ClientSecretParam",
    {
      parameterName: "client_secret",
    }
  ).stringValue;

  const issuer = ssm.StringParameter.fromStringParameterAttributes(
    stack,
    "IssuerParam",
    {
      parameterName: "issuer",
    }
  ).stringValue;

  const pool = new cognito.UserPool(stack, "UserPool", {
    userPoolName: "sammy-userpool", 
  });

  pool.addClient("sammy-app-client", {
    supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.custom("auth0")],
    oAuth: {
      flows: {
        authorizationCodeGrant: true,
      },
      scopes: [
        cognito.OAuthScope.OPENID,
        cognito.OAuthScope.EMAIL,
        cognito.OAuthScope.PROFILE,
        cognito.OAuthScope.PHONE,
      ],
      callbackUrls: ["https://sammy.link", "http://localhost:4200", "https://auth.sammy.link/oauth2/idpresponse"],
      logoutUrls: ["https://sammy.link", "http://localhost:4200"],
    },
    preventUserExistenceErrors: true,
  });

  new cognito.CfnUserPoolIdentityProvider(stack, "IdentityProvider", {
    providerName: "auth0",
    providerType: "OIDC",
    userPoolId: pool.userPoolId,
    attributeMapping: {
      sub: "Username",
      email: "Email",
      name: "Name"
    },
    providerDetails: {
      client_id: clientId,
      client_secret: clientSecret,
      attributes_request_method: "GET",
      oidc_issuer: issuer,
      authorize_scopes: "openid profile email phone",
    },
  });

  const domainName = "auth.sammy.link";

  const certificate = new acm.Certificate(stack, "Certificate", {
    domainName,
    validation: acm.CertificateValidation.fromDns(hostedZone),
  });

  const userPoolDomain = pool.addDomain("CustomDomain", {
    customDomain: {
      domainName,
      certificate,
    },
  });

  new route53.ARecord(stack, "UserPoolCloudFrontAliasRecord", {
    zone: hostedZone,
    recordName: "auth",
    target: route53.RecordTarget.fromAlias(
      new route53_targets.UserPoolDomainTarget(userPoolDomain)
    ),
  });
};

interface InfraProps extends cdk.StackProps {
  distribution: cloudfront.CloudFrontWebDistribution;
  hostedZone: route53.IHostedZone;
}
