#!/bin/bash
set -e

while getopts o: flag
do
    case "${flag}" in
        o) oauth=${OPTARG};;
    esac
done

if [ "$oauth" == "" ]; then
        echo "pass oauth token ie. (-o token_example)"
        exit
fi

aws secretsmanager create-secret --name oauth-token --secret-string $oauth
cdk --app "npx ts-node bin/create-secrets_cdk.ts"
cdk synth CreateSecretsStack
cdk deploy CreateSecretsStack