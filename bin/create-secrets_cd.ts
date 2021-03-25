#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core'; 
import { CreateSecretsStack } from '../lib/create_secrets-stack';

const app = new cdk.App(); 
new CreateSecretsStack(app, 'CreateSecretsStack');