import * as cdk from '@aws-cdk/core';
import { config } from 'dotenv';
import * as ssm from '@aws-cdk/aws-ssm';
import { join } from 'path';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';

export class CreateSecretsStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        config({ path: join(__dirname, '../env', `${process.env.ENVIRONMENT}.env`) })

        const { OWNER, REPO, BRANCH, ZONE_NAME, HOSTED_ZONE_ID, WEB_REPO } = process.env;

        if (OWNER && REPO && BRANCH && ZONE_NAME && HOSTED_ZONE_ID && WEB_REPO) {
            new ssm.StringParameter(this, 'OwnerParam', {
                parameterName: 'owner',
                stringValue: OWNER,
            });

            new ssm.StringParameter(this, 'RepoParam', {
                parameterName: 'repo',
                stringValue: REPO,
            });

            new ssm.StringParameter(this, 'WebRepoParam', {
                parameterName: 'web_repo',
                stringValue: WEB_REPO,
            });

            new ssm.StringParameter(this, 'BranchParam', {
                parameterName: 'branch',
                stringValue: BRANCH,
            });

            new ssm.StringParameter(this, 'ZoneNameParam', {
                parameterName: 'zone_name',
                stringValue: ZONE_NAME,
            });

            new ssm.StringParameter(this, 'HostedZoneIdParam', {
                parameterName: 'hosted_zone_id',
                stringValue: HOSTED_ZONE_ID,
            }); 
        } else {
            console.log("must define a environment file ie. local.env and set the name of it as an environment variable ie. export ENVIRONMENT=local");
        }
    }
}
