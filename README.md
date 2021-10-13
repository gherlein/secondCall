# Second Call

This is  my [firstCall](https://github.com/gherlein/firstCall) application with some incremental improvements:

## Typescript in the CDK

I ported the CDK script from jacascript to typescript.  This allows me to "transpile" the ts code into js and enforce strong
type checking.  This is a good thing (tm).

## Changed static wav file to play a dynamic message using Amazon Polly

[Amazon Polly](https://aws.amazon.com/polly/) is a service that turns text into lifelike speech, allowing you to create applications that talk, and build entirely new categories of speech-enabled products.
This is the most basic use-case - a derivative of the old 555-1212 (yep, showing my age):  call the number and it reads you the time.  I kept it simple and support only UCT for now.

This is NOT production quality.  I don't do any cleanup and there's cruft from firstCall still to clean up.  I also borrowed some code from [Sid Rao](https://github.com/siddhartharao/visual-voicemail).  The hard part I had
to solve was the IAM permissions parts.  The docs are not clear on how exactly to do this.  But here is the IAM policy I needed:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": "polly:SynthesizeSpeech",
            "Resource": "*",
            "Effect": "Allow"
        },
        {
            "Action": [
                "s3:PutObject",
                "s3:ListObject"
            ],
            "Resource": "arn:aws:s3:::secondcallstack-wavfiles98e3397d-1rbn6cv8r478h/*",
            "Effect": "Allow"
        }
    ]
}
```

I was very much thrown off by the Polly docs on ["Setting Up the IAM Policy for Asynchronous Synthesis"](https://docs.aws.amazon.com/polly/latest/dg/asynchronous-iam.html).  Also, the 
[example](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/polly-examples.html) of how to call the API is confusing:

```javascript
const run = async () => {
 try {
 const data = await polly.send(
 new StartSpeechSynthesisTaskCommand(s3Params));
     }
};
```

That example is using identity, which realistically means using Cognito.  But if you want to do role-based IAM, it turns out it's a tad different.  And the actual IAM policy is much different. You need: 

```
Action": "polly:SynthesizeSpeech"
```

Alas, now I know.  The snip of code that does this is:

```typescript
const smaLambdaRole = new iam.Role(this, 'smaLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });
        smaLambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
        
        const pollyRole = new iam.Role(this, 'pollyRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        }); 
        const pollyPolicyDoc = new iam.PolicyDocument({
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                   //actions: ["polly:StartSpeechSynthesisTask","polly:ListSpeechSynthesisTasks","polly:GetSpeechSynthesisTask"],
                   actions: ["polly:SynthesizeSpeech"],
                   resources: ["*"],
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ["s3:PutObject","s3:ListObject"],
                    resources: [`${wavFiles.bucketArn}/*`],
                }),/*
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ["sns:Publish"],
                    resources: ["*"],
                }),*/
            ],
        });
        const pollyPollicy = new iam.Policy(this, 'pollyPollicy', {
            document: pollyPolicyDoc
          });
        smaLambdaRole.attachInlinePolicy(pollyPollicy);
```

I very much need to clean this all up and make it pretty and ensure that I don't have some cruft hanging out, but for now it works.  Now off to chase how I can
file an issue with the Polly IAM docs!

