import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as ssm from '@aws-cdk/aws-ssm';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as codebuild from '@aws-cdk/aws-codebuild';
import { SecretValue } from "@aws-cdk/core";
import * as s3 from '@aws-cdk/aws-s3';

export class InfrastructureCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const { oauth, branch, owner, repo, webRepo } = getParameters(this);

    buildInfrastructurePipeline(this, owner, repo, oauth, branch);
    buildWebsitePipeline(this, owner, webRepo, oauth, branch);
  }
}

const getParameters = (stack: cdk.Stack): StackParameters => {
  const owner = ssm.StringParameter.fromStringParameterAttributes(stack, 'OwnerParam', {
    parameterName: 'owner'
  }).stringValue;

  const branch = ssm.StringParameter.fromStringParameterAttributes(stack, 'BranchParam', {
    parameterName: 'branch'
  }).stringValue;

  const repo = ssm.StringParameter.fromStringParameterAttributes(stack, 'RepoParam', {
    parameterName: 'repo'
  }).stringValue;

  const webRepo = ssm.StringParameter.fromStringParameterAttributes(stack, 'WebRepoParam', {
    parameterName: 'web_repo'
  }).stringValue;

  const oauth = secretsmanager.Secret.fromSecretNameV2(stack, 'OauthSecret', 'oauth-token').secretValue
  const webOauth = secretsmanager.Secret.fromSecretNameV2(stack, 'WebOauthSecret', 'web-oauth-token').secretValue

  return {
    owner,
    branch,
    repo,
    oauth,
    webRepo
  }
}

type StackParameters = {
  owner: string,
  branch: string,
  repo: string,
  oauth: SecretValue
  webRepo: string
}

const buildInfrastructurePipeline = (stack: cdk.Stack, owner: string, repo: string, oauth: SecretValue, branch: string) => {
  const sourceOutput = new codepipeline.Artifact();
  const cdkBuildOutput = new codepipeline.Artifact();

  const cdkBuild = new codebuild.PipelineProject(stack, 'CdkBuild', {
    buildSpec: codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases: {
        install: {
          commands: 'npm install',
        },
        build: {
          commands: [
            'npm run build',
            'npm run cdk synth -- -o dist'
          ],
        },
      },
      artifacts: {
        'base-directory': 'dist',
        files: [
          'InfrastructureCdkStack.template.json',
          'WebsiteCdkStack.template.json'
        ],
      },
    }),
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
    },
  });

  new codepipeline.Pipeline(stack, 'InfrastructurePipeline', {
    pipelineName: 'InfrastructurePipeline',
    crossAccountKeys: false,
    stages: [
      {
        stageName: 'Source',
        actions: [
          new codepipeline_actions.GitHubSourceAction({
            actionName: 'GitHub_Source',
            owner,
            repo,
            oauthToken: oauth,
            output: sourceOutput,
            branch
          })
        ],
      },
      {
        stageName: 'Build',
        actions: [
          new codepipeline_actions.CodeBuildAction({
            actionName: 'CDK_Build',
            project: cdkBuild,
            input: sourceOutput,
            outputs: [cdkBuildOutput],
          }),
        ],
      },
      {
        stageName: 'Deploy',
        actions: [
          new codepipeline_actions.CloudFormationCreateUpdateStackAction({
            actionName: 'Pipeline',
            templatePath: cdkBuildOutput.atPath('InfrastructureCdkStack.template.json'),
            stackName: 'InfrastructureCdkStack',
            adminPermissions: true,
          }),
          new codepipeline_actions.CloudFormationCreateUpdateStackAction({
            actionName: 'Website',
            templatePath: cdkBuildOutput.atPath('WebsiteCdkStack.template.json'),
            stackName: 'WebsiteCdkStack',
            adminPermissions: true,
          }),
        ],
      }
    ]
  });

}

const buildWebsitePipeline = (stack: cdk.Stack, owner: string, repo: string, oauth: SecretValue, branch: string) => {

  const sourceOutput = new codepipeline.Artifact();
  const angularOutput = new codepipeline.Artifact();

  const targetBucket = s3.Bucket.fromBucketName(stack, 'WebTargetBucket', 'sammyBucketForWeb864');

  const cdkBuild = new codebuild.PipelineProject(stack, 'WebProject', {
    buildSpec: codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases: {
        install: {
          commands: ['npm install',
          'pip install awscli --upgrade --user',]
          
        },
        build: {
          commands: [
            'npm run build'
          ],
        },
      },
      artifacts: {
        'files': [
          '**/*'
        ],
        'base-directory': 'dist/sammy',
        'discard-paths': 'yes'
      },
    }),
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
    },
  });

  new codepipeline.Pipeline(stack, 'InfrastructurePipeline', {
    pipelineName: 'InfrastructurePipeline',
    crossAccountKeys: false,
    stages: [
      {
        stageName: 'Source',
        actions: [
          new codepipeline_actions.GitHubSourceAction({
            actionName: 'GitHub_Source',
            owner,
            repo,
            oauthToken: oauth,
            output: sourceOutput,
            branch
          })
        ],
      },
      {
        stageName: 'Build',
        actions: [
          new codepipeline_actions.CodeBuildAction({
            actionName: 'Build',
            project: cdkBuild,
            input: sourceOutput,
            outputs: [angularOutput],
          }),
        ],
      },
      {
        stageName: 'Deploy',
        actions: [
          new codepipeline_actions.S3DeployAction({
            actionName: 'S3Deploy', 
            bucket: targetBucket,
            input: angularOutput,
          })
        ],
      }
    ]
  });

}