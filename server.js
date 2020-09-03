/**
 *
 */
const {ActivityTypes,
    CardFactory,
    MessageFactory,
    BotFrameworkAdapter} = require('botbuilder');
  const protoToJson = require('./proto_to_json');
  const dialogflowSessionClient = require('./dialogflow_session_client');
  const filterResponses = require('./filter_responses');
  const express = require('express');
  const app = express();
  const Cleverbot = require('cleverbot-api-node'); 
  const {google} = require('googleapis');
  const mongojs = require('mongojs');
 


  
  //For authenticating dialogflow_session_client.js, create a Service Account and
  // download its key file. Set the environmental variable
  // GOOGLE_APPLICATION_CREDENTIALS to the key file's location.
  //See https://dialogflow.com/docs/reference/v2-auth-setup and
  // https://cloud.google.com/dialogflow/docs/setup for details.
  
  const projectId = 'cci-servicenow-auto-dispatcher';
  const appId = '6020d768-ff33-4297-ab58-56f76da195ef';
  const appPassword = 'dZpYjW-_ko4e--Du2n7-d7Ke80.VxlamaB';
  
  const sessionClient = new dialogflowSessionClient(projectId);
  
  // Create bot adapter, which defines how the bot sends and receives messages.
  let adapter = new BotFrameworkAdapter({
    appId: appId,
    appPassword: appPassword
  });
  
  const port = process.env.PORT;
  
  const listener = app.listen(port, () => {
    console.log('Your Skype integration server is listening on port '
        + listener.address().port);
  });
  
  app.post('/', (req, res) => {
    // Use the adapter to process the incoming web request into a TurnContext object.
    adapter.processActivity(req, res, async (turnContext) => {
      if (isMessage(turnContext)) {
        const utterance = getMessageText(turnContext);
        const senderId = turnContext.activity.from.id;
        const payload = turnContext.activity;
        const responses = (await sessionClient.detectIntent(
            utterance, senderId, payload)).fulfillmentMessages;
        const replies = await convertToSkypeMessage(turnContext, responses);
        await turnContext.sendActivities(replies);
      } else if(isMemberAdded(turnContext)) {
        for (let idx in turnContext.activity.membersAdded) {
          if (turnContext.activity.membersAdded[idx].id !==
              turnContext.activity.recipient.id) {
            const result = await sessionClient.detectIntentWithEvent('SKYPE_WELCOME',
                projectId);
            const replies = await convertToSkypeMessage(turnContext,
                result.fulfillmentMessages);
            await turnContext.sendActivity(replies);
          }
        }
      }
    });
  });
  
  //added part by baris secen
  const app2 = express();
  var http = require('http').Server(app2);
  var io = require('socket.io')(http);
  var port2 = 3000;
  var db = mongojs('mongodb+srv://bsecen:Sm123456$@cluster0.lsone.mongodb.net/titan?retryWrites=true&w=majority',['conversation']);

  const sessionClient2 = new dialogflowSessionClient(projectId);


  app2.get('/', (request, response) => {
    response.sendFile(__dirname + '/public/index.html');
  });
  app2.use(express.static(__dirname + '/public'));
  io.on('connection', function(socket){
    socket.on('chat message', async(msg) => {
      //io.emit('chat message', msg);
      const diMes = await sessionClient2.detectIntent(msg,'quickstart-session-id');
      var outMes = diMes.fulfillmentText;
      var conver = {"user_message":msg}
     if (outMes=="Sorry, I'm not trained to help with that. Please provide additional details and I will do my best to provide assistance.")
      {
           //request
        const Clever = new Cleverbot('CC936KmOCw8j9fHN20hn6ZWw0LA');
 
        Clever.request(msg).then(function(response) {
        //console.log(response.output);
        io.emit('chat message', response.output);

        //write to the mongoDB
        conver = {"user_message":msg, "robot_message":response.output, "intent":diMes.intent.displayName, "intent_confidence":diMes.intentDetectionConfidence, "sentiment_score":diMes.sentimentAnalysisResult.queryTextSentiment.score};
        db.conversation.save(conver, function(err, conver){
          //console.log(conver);
        });  

        }).catch(function(error) {
        console.error(error);
        });

      //////////////////////////////
    }
   else{
    io.emit('chat message', outMes);
    //write to the mongoDB
    conver = {"user_message":msg, "robot_message":outMes, "intent":diMes.intent.displayName, "intent_confidence":diMes.intentDetectionConfidence, "sentiment_score":diMes.sentimentAnalysisResult.queryTextSentiment.score};
    db.conversation.save(conver, function(err, conver){
          //console.log(conver);
    });  
   }
      
    });
  });
  
  http.listen(port2, function(){
    console.log('listening on *:' + port2);
  });
/////////////////////////////////////////////


  function turnContextType(turnContext) {
    return turnContext.activity.type;
  }
  
  function isMessage(turnContext){
    return turnContextType(turnContext) === 'message';
  }
  
  function getMessageText(turnContext) {
    return turnContext.activity.text;
  }
  
  function isMemberAdded(turnContext){
    return Array.isArray(turnContext.activity.membersAdded);
  }
  
  async function convertToSkypeMessage(turnContext, responses){
    const replies = [];
    if (Array.isArray(responses)) {
      const filteredResponses = await filterResponses.filterResponses(responses, 'SKYPE');
      filteredResponses.forEach((response)=> {
        let reply = {type: ActivityTypes.Message};
        switch (response.message) {
          case 'text': {
            reply.text = response.text.text[0];
          }
            break;
  
          case 'image': {
            reply.attachments = [(CardFactory.heroCard(
                '',
                CardFactory.images([response.image.imageUri])
            ))];
          }
            break;
  
          case 'card': {
            const buttons = response.card.buttons;
            let skypeButtons = [];
            if (Array.isArray(buttons) && buttons.length > 0) {
              buttons.forEach((button) => {
                if (button.postback.startsWith('http')) {
                  skypeButtons.push({
                    type: 'openUrl',
                    title: button.text,
                    value: button.postback
                  });
                } else {
                  skypeButtons.push({
                    type: 'postBack',
                    title: button.text,
                    value: button.postback
                  });
                }
              });
              reply.attachments = [(CardFactory.heroCard(
                  response.card.title,
                  response.card.subtitle,
                  CardFactory.images([response.card.imageUri]),
                  skypeButtons))];
            }
          }
            break;
  
          case 'quickReplies': {
            reply = MessageFactory.suggestedActions(
                response.quickReplies.quickReplies, response.quickReplies.title);
          }
            break;
  
          case 'payload': {
            console.log(response);
            const protoPayload = response.payload.fields.skype.structValue;
            reply = protoToJson.structProtoToJson(protoPayload);
          }
            break;
  
          default:
            break;
        }
        replies.push(reply);
      });
    }
    return replies;
  }
  
  module.exports = {
    convertToSkypeMessage
  };
  