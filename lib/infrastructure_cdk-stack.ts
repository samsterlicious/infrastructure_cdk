import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';

export class InfrastructureCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const owner = this.node.tryGetContext('owner');
    const repo = this.node.tryGetContext('repo');
    const oauthToken = this.node.tryGetContext('oauthToken');
    const branch = this.node.tryGetContext('branch');

    const pipeline = new codepipeline.Pipeline(this, 'InfrastructurePipeline', {
      pipelineName: 'InfrastructurePipeline',
      crossAccountKeys: false,

    });

    const sourceOutput = new codepipeline.Artifact();

    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source',
      owner,
      repo,
      oauthToken,
      output: sourceOutput,
      branch
    });

    const sourceStage = pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction
      ],
    });
  }
}
