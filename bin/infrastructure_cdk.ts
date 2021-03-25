#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { InfrastructureCdkStack } from '../lib/infrastructure_cdk-stack'; 
import { WebsiteStack } from '../lib/website-stack';
const app = new cdk.App();
new InfrastructureCdkStack(app, 'InfrastructureCdkStack');
new WebsiteStack(app, 'WebsiteCdkStack')