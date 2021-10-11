//  “Copyright Amazon.com Inc. or its affiliates.” 
const AWS = require('aws-sdk');
const wavFileBucket = process.env['WAVFILE_BUCKET']
const REGION = process.env.REGION;

const Polly = new AWS.Polly({
    signatureVersion: 'v4',
    region: REGION
});
const s3 = new AWS.S3();
  
const transcribeClient = new AWS.TranscribeService({
  signatureVersion: 'v4',
  region: REGION
});
  


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

const announcementsKeyPrefix = "announcements/";

// New call, synthesis of a dynamic welcome speech using Polly.
async function newCall(event) {
    let rv = [];
    //const callID = legA.CallId;
    const s3EntranceKeyName = announcementsKeyPrefix + "/entrance.wav";
    console.log("synthesizing voice to "+s3EntranceKeyName);
    await synthesizeWelcomeSpeech(wavFileBucket, s3EntranceKeyName);
    console.log("calling playAudioAction");
    playAudioAction.Parameters.AudioSource.Key = s3EntranceKeyName;
    return [playAudioAction];
    return rv;
};


// Helper methods to synthesize speech using Polly
async function synthesizeWelcomeSpeech(s3Bucket, s3Key) {
    d = new Date();
    h = d.getHours();
    m = d.getMinutes();
    console.log(h.toString() +m.toString());
    let audioBuffer = await synthesizeSpeechInternal("<speak>Welcome to <emphasis>secondCall.</emphasis><break/>The time is" +h.toString() +m.toString() +"U C T<break/>.  <emphasis>Goodbye</emphasis></speak>", 'ssml', 'Joanna', 'en-US');
    return audioBuffer ? addWaveHeaderAndUploadToS3(audioBuffer, s3Bucket, s3Key) : null;    
};

async function synthesizeSpeech(s3Bucket, s3Key, text, textType, voiceID, languageCode) {
    let audioBuffer = await synthesizeSpeechInternal(text, textType, voiceID, languageCode);
    return audioBuffer ? addWaveHeaderAndUploadToS3(audioBuffer, s3Bucket, s3Key) : null;
};

async function addWaveHeaderAndUploadToS3(audioBuffer, s3Bucket, s3Key) {
    var uint16Buffer = new Uint16Array(audioBuffer);

    var wavArray = buildWaveHeader({
        numFrames: uint16Buffer.length,
        numChannels: 1,
        sampleRate: 8000,
        bytesPerSample: 2
    });
    
    var totalBuffer = _appendBuffer(wavArray, audioBuffer);
    return uploadAnnouncementToS3(s3Bucket, s3Key, totalBuffer);
};

async function uploadAnnouncementToS3(s3Bucket, s3Key, totalBuffer) {
    var buff = Buffer.from(totalBuffer);

    let s3params = {
        Body: buff, 
        Bucket: s3Bucket, 
        Key: s3Key,
        ContentType: 'audio/wav'
    };
    
    return s3.upload(s3params).promise();
};

async function getS3Data(s3Bucket, s3Key) {
    let s3params = {
        Bucket: s3Bucket, 
        Key: s3Key
    };

    let s3Object = await s3.getObject(s3params).promise();
    console.log("S3 Object");
    console.log(s3Object);
    return s3Object.Body;
}

async function synthesizeSpeechInternal(text, textType, voiceID, languageCode) {
    try {
        let pollyparams = {
            'Text': text,
            'TextType': textType,
            'OutputFormat': 'pcm',
            'SampleRate': '8000',
            'VoiceId': voiceID,
            'LanguageCode': languageCode
        };

        const pollyResult = await Polly.synthesizeSpeech(pollyparams).promise();
        if (pollyResult.AudioStream.buffer) {
            return pollyResult.AudioStream.buffer;
        }
        else {
            return null;
        }
    } catch (synthesizeError) {
        console.log(synthesizeError);
        return null;
    }
};

function buildWaveHeader(opts) {
    var numFrames = opts.numFrames;
    var numChannels = opts.numChannels || 2;
    var sampleRate = opts.sampleRate || 44100;
    var bytesPerSample = opts.bytesPerSample || 2;
    var blockAlign = numChannels * bytesPerSample;
    var byteRate = sampleRate * blockAlign;
    var dataSize = numFrames * blockAlign;
  
    var buffer = new ArrayBuffer(44);
    var dv = new DataView(buffer);
  
    var p = 0;
  
    function writeString(s) {
        for (var i = 0; i < s.length; i++) {
            dv.setUint8(p + i, s.charCodeAt(i));
        }
        p += s.length;
    }
  
    function writeUint32(d) {
        dv.setUint32(p, d, true);
        p += 4;
    }
  
    function writeUint16(d) {
        dv.setUint16(p, d, true);
        p += 2;
    }
  
    writeString('RIFF');              // ChunkID
    writeUint32(dataSize + 36);       // ChunkSize
    writeString('WAVE');              // Format
    writeString('fmt ');              // Subchunk1ID
    writeUint32(16);                  // Subchunk1Size
    writeUint16(1);                   // AudioFormat
    writeUint16(numChannels);         // NumChannels
    writeUint32(sampleRate);          // SampleRate
    writeUint32(byteRate);            // ByteRate
    writeUint16(blockAlign);          // BlockAlign
    writeUint16(bytesPerSample * 8);  // BitsPerSample
    writeString('data');              // Subchunk2ID
    writeUint32(dataSize);            // Subchunk2Size
  
    return buffer;
}
  
var _appendBuffer = function(buffer1, buffer2) {
    var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    tmp.set(new Uint8Array(buffer1), 0);
    tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
    return tmp;
};



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


