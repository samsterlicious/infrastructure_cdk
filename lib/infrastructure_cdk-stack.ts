import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as ssm from '@aws-cdk/aws-ssm';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager'; 
import * as codebuild from '@aws-cdk/aws-codebuild';
import { SecretValue } from "@aws-cdk/core";

export class InfrastructureCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const { oauth, branch, owner, repo } = getParameters(this);

    const sourceOutput = new codepipeline.Artifact();
    const cdkBuildOutput = new codepipeline.Artifact();

    const cdkBuild = new codebuild.PipelineProject(this, 'CdkBuild', {
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
          ],
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
      },
    });

    const pipeline = new codepipeline.Pipeline(this, 'InfrastructurePipeline', {
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
              actionName: 'Deploy',
              templatePath: cdkBuildOutput.atPath('InfrastructureCdkStack.template.json'),
              stackName: 'InfrastructureCdkStack',
              adminPermissions: true,
            }),
          ],
        }
      ]
    }); 

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

  const oauth = secretsmanager.Secret.fromSecretNameV2(stack, 'OauthSecret', 'oauth-token').secretValue

  return {
    owner,
    branch,
    repo,
    oauth
  }
}

type StackParameters = {
  owner: string,
  branch: string,
  repo: string,
  oauth: SecretValue
}