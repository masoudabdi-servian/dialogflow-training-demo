// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const axios = require('axios');
const fs = require('fs');

const Storage = require('@google-cloud/storage');
const storage = new Storage();

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
 
  
  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }
 
  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }
  
  function balance(agent) {
    console.log('agent.parameters', agent.parameters);
    //agent.setContext('balance-check');
    
    return axios.get(
      `https://asia-northeast1-masoud-nab-demos.cloudfunctions.net/check-balance?`+
			`id=${agent.parameters['Customer-number']}&`+
			`name=${agent.parameters['given-name']}` 
    ).then((res) => {
      
      console.log(res.data);
      console.log(res.data.savings);
      
      if(agent.parameters['Account-type']){
      	agent.add(`Ok, the balance for your ${agent.parameters['Account-type']} account is \$${res.data[agent.parameters['Account-type']]}`);
      }
      else{
      	agent.add(`You have \$${res.data.savings} in Savings, and \$${res.data.everyday} in Everyday`);
      }
      
      //agent.setFollowupEvent({ "name": "authenticated", "parameters" : { "received": "false"}});
      //agent.setContext({ name: 'balance-check', lifespan: 2, parameters: { data: res.data }});
    }).catch((e) => {
      agent.add(`Sorry I couldn't find your account, please check your details and try again.`);
    });
  }
  
  function transfer(agent) {
    console.log('agent.parameters', agent.parameters);
    //agent.setContext('balance-check');
    
    return axios.get(
      `https://asia-northeast1-masoud-nab-demos.cloudfunctions.net/transfer?`+
			`from_id=${agent.parameters.from_id}&`+
			`from_account=savings&`+
			`to_id=${agent.parameters.to_id}&`+
			`to_account=savings&`+
			`amount=${agent.parameters.unit_currency.amount}` 
    ).then((res) => {
      
      console.log(res);
      agent.add(`Ok, I've done the transfer for you.`);
      //agent.setFollowupEvent({ "name": "authenticated", "parameters" : { "received": "false"}});
      //agent.setFollowupEvent('authenticated');
      
    }).catch((e) => {
      agent.add(`Sorry I couldn't find your account, please check your details and try again.`);
    });
  }
  
  
  function preStatement(agent) {
    console.log('preStatement');
    console.log('agent.parameters', agent.parameters);
    console.log('agent.contexts', agent.contexts);
    
    //pre calculating the result of the statement
    axios.get(
      `https://asia-northeast1-masoud-nab-demos.cloudfunctions.net/check-balance?`+
			`id=${agent.parameters['Customer-number']}&`+
			`name=${agent.parameters['given-name']}` 
    ).then((res) => {
      let filename = `/tmp/${agent.parameters['given-name']}.txt`;
      let txt = `This is your awesome statement\n`;
      txt = txt + `Your statement is: You have \$${res.data.savings} in Savings, and \$${res.data.everyday} in Everyday`;
      fs.writeFile(filename, txt, function(err) {
          if(err) {
              return console.log(err);
          }
          console.log("The file was saved!");
      }); 

      // putting the object into the cloud storage
      storage.bucket('training-statements').upload(filename);
      
    }).catch((e) => {
      
    });

    var currentTime = new Date().getTime(); 
    while (currentTime + 1500 >= new Date().getTime()) {
      // sleep for some time
      // simulating some long process
    } 
    
    // Followup Event
    agent.setFollowupEvent({ "name": "statement", "lifespan": "3", "parameters" : { 
      "Account-type": agent.parameters['Account-type'],
      "Customer-number": agent.parameters['Customer-number'],
      "given-name": agent.parameters['given-name']
    }});
  }

  function statement(agent) {
    console.log('statement');
    console.log('agent.parameters', agent.parameters);
    console.log('agent.getContext()', agent.getContext('statement'));
    
    //agent.setContext('balance-check');

    var currentTime = new Date().getTime(); 
    while (currentTime + 3000 >= new Date().getTime()) {
      // sleep for some time
      // To make sure the data is ready
    }
    

    const options = {
      version: 'v2', // defaults to 'v2' if missing.
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60, // one hour
    };

    // Get a v2 signed URL for the file
    return storage.bucket('training-statements')
      .file(`${agent.getContext('statement').parameters['given-name']}.txt`)
      .getSignedUrl(options)
      .then((url) => {
      console.log('the url is', url);
      agent.add(`Your statement is available here`);
      agent.add(new Card({
        title: `Title: this is a card title`,
        imageUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/fa/National_Australia_Bank.svg/250px-National_Australia_Bank.svg.png',
        text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
        buttonText: 'Click here to see your statement!',
        buttonUrl: url
      }));
    })
      .catch(e => {
      console.log(e);
      agent.add(`Sorry I couldn't prepare your statement, please ask again!`);
    });
    
  }

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Balance', balance);
  intentMap.set('Transfer', transfer);
  intentMap.set('Pre Statement', preStatement);
  intentMap.set('Statement', statement);
  // intentMap.set('your intent name here', yourFunctionHandler);
  // intentMap.set('your intent name here', googleAssistantHandler);
  agent.handleRequest(intentMap);
});
