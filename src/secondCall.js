//  “Copyright Amazon.com Inc. or its affiliates.” 
const AWS = require('aws-sdk');
const wavFileBucket = process.env['WAVFILE_BUCKET']

exports.handler = async(event, context, callback) => {
    console.log(JSON.stringify(event));
    let actions;

    switch (event.InvocationEventType) {
        case "NEW_INBOUND_CALL":
//            console.log("NEW_INBOUND_CALL");
            actions = await newCall(event);
            break;

        case "ACTION_SUCCESSFUL":
//            console.log("SUCCESS ACTION");
            actions = [hangupAction];
	    break;
        
        case "HANGUP":
//            console.log("HANGUP ACTION");
            actions = []
            break;

        case "CALL_ANSWERED":
//            console.log("CALL ANSWERED")
            actions = []
            break;

        default:
//            console.log("FAILED ACTION");
            actions = [hangupAction];
    }

    const response = {
        "SchemaVersion": "1.0",
        "Actions": actions
    };

    callback(null, response);
}

async function newCall(event, details) {
    playAudioAction.Parameters.AudioSource.Key = "hello-goodbye.wav";
    return [playAudioAction,hangupAction];
}


const hangupAction = {
    "Type": "Hangup",
    "Parameters": {
        "SipResponseCode": "0",
        "ParticipantTag": "",        
    }
};

const playAudioAction = {
    "Type": "PlayAudio",
    "Parameters": {
        "AudioSource": {
            "Type": "S3",
            "BucketName": wavFileBucket,
            "Key": ""
        }
    }
};

const pauseAction = {
    "Type": "Pause",
    "Parameters": {
        "DurationInMilliseconds": "1000"
    }
};


