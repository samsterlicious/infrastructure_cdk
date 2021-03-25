import * as cdk from '@aws-cdk/core';
import { config } from 'dotenv';
import * as ssm from '@aws-cdk/aws-ssm';
import { join } from 'path';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';

export class CreateSecretsStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        config({ path: join(__dirname,'../env',`${process.env.ENVIRONMENT}.env`) })

        const { OWNER, REPO, BRANCH, OATH_TOKEN } = process.env;

        if (OWNER && REPO && BRANCH && OATH_TOKEN) {
            const ownerParam = new ssm.StringParameter(this, 'OwnerParam', {
                parameterName: 'owner',
                stringValue: OWNER,
            });

            const repoParam = new ssm.StringParameter(this, 'RepoParam', {
                parameterName: 'repo',
                stringValue: REPO,
            });

            const branchParam = new ssm.StringParameter(this, 'BranchParam', {
                parameterName: 'branch',
                stringValue: BRANCH,
            }); 
        } else {
            throw "must define a environment file ie. local.env and set the name of it as an environment variable ie. export ENVIRONMENT=local";
        }
    }
}
