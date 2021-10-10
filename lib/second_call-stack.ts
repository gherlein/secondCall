//  “Copyright Amazon.com Inc. or its affiliates.” 
import * as cdk from '@aws-cdk/core';
import s3 = require('@aws-cdk/aws-s3');
import s3deploy = require('@aws-cdk/aws-s3-deployment')
import iam = require('@aws-cdk/aws-iam')
import lambda = require('@aws-cdk/aws-lambda');
import custom = require('@aws-cdk/custom-resources')
//import core_1 = require("@aws-cdk/core");

export class SecondCallStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // create a bucket for the recorded wave files and set the right policies
        const wavFiles = new s3.Bucket(this, 'wavFiles', {
            publicReadAccess: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });
        const wavFileBucketPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:GetObject',
                's3:PutObject',
                's3:PutObjectAcl'
            ],
            resources: [
                wavFiles.bucketArn,
                `${wavFiles.bucketArn}/*`
            ],
            sid: 'SIPMediaApplicationRead',
        });
        wavFileBucketPolicy.addServicePrincipal('voiceconnector.chime.amazonaws.com');
        wavFiles.addToResourcePolicy(wavFileBucketPolicy);
        new s3deploy.BucketDeployment(this, 'WavDeploy', {
            sources: [s3deploy.Source.asset('./wav_files')],
            destinationBucket: wavFiles,
            contentType: 'audio/wav'
        });
        const smaLambdaRole = new iam.Role(this, 'smaLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });
        smaLambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));

        // create the lambda function that does the call
        const secondCall = new lambda.Function(this, 'secondCall', {
            code: lambda.Code.fromAsset("src", { exclude: ["**", "!secondCall.js"] }),
            handler: 'secondCall.handler',
            runtime: lambda.Runtime.NODEJS_14_X,
            environment: {
                WAVFILE_BUCKET: wavFiles.bucketName,
            },
            role: smaLambdaRole,
            timeout: cdk.Duration.seconds(60)
        });
        const chimeCreateRole = new iam.Role(this, 'createChimeLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                ['chimePolicy']: new iam.PolicyDocument({
                    statements: [new iam.PolicyStatement({
                        resources: ['*'],
                        actions: ['chime:*',
                            'lambda:GetPolicy',
                            'lambda:AddPermission']
                    })]
                })
            },
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")]
        });


        // create the lambda for CDK custom resource to deploy SMA, etc.
        const createSMALambda = new lambda.Function(this, 'createSMALambda', {
            code: lambda.Code.fromAsset("src", { exclude: ["**", "!createChimeResources.py"] }),
            handler: 'createChimeResources.on_event',
            runtime: lambda.Runtime.PYTHON_3_8,
            role: chimeCreateRole,
            timeout: cdk.Duration.seconds(60)
        });
        const chimeProvider = new custom.Provider(this, 'chimeProvider', {
            onEventHandler: createSMALambda
        });
        const inboundSMA = new cdk.CustomResource(this, 'inboundSMA', {
            serviceToken: chimeProvider.serviceToken,
            properties: {
                'lambdaArn': secondCall.functionArn,
                'region': this.region,
                'smaName': this.stackName + '-inbound',
                'ruleName': this.stackName + '-inbound',
                'createSMA': true,
                'smaID': '',
                'phoneNumberRequired': true
            }
        });
        const inboundPhoneNumber = inboundSMA.getAttString('phoneNumber');
        new cdk.CfnOutput(this, 'inboundPhoneNumber', { value: inboundPhoneNumber });

    }
}
exports.SecondCallStack = SecondCallStack;
