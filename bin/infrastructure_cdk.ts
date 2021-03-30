#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { InfrastructureCdkStack } from "../lib/infrastructure_cdk-stack";
import { WebsiteStack } from "../lib/website-stack";
import { CreateSecretsStack } from "../lib/create_secrets-stack";

const app = new cdk.App();
new CreateSecretsStack(app, "CreateSecretsStack");

const websiteStack = new WebsiteStack(app, "WebsiteCdkStack");

new InfrastructureCdkStack(app, "InfrastructureCdkStack", {
  distribution: websiteStack.distribution,
  hostedZone: websiteStack.hostedZone,
});
