
'use strict'

let Service, Characteristic, HomebridgeAPI, Categories

var request = require("request");
const defaultJSON = require('./../default.json')
const packageJSON = require('./../package.json')
const util = require('./../util.js')

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Categories = homebridge.hap.Categories;

  homebridge.registerAccessory("messana-zone", "ThermostatZone", ThermostatZone);
  homebridge.registerAccessory("messana-zone", "OptTemp", OptTemp);
  homebridge.registerAccessory("messana-zone", "AirQuality", AirQuality);
  homebridge.registerAccessory("messana-zone", "RelHumidity", RelHumidity);
};

function ThermostatZone(log, config, api) {
  this.apikey = util.getApiKey(api)
  this.log = log;
  this.logZone = config.logZone || 0;
  this.config = config
  this.name = config.name;
  this.id = config.id;
  this.desiredRH = (config.desiredRH == 0)? 0 : 1;
  this.model = packageJSON.models[0];
  this.apiroute = util.staticValues.apiroute
  this.temperatureDisplayUnits = defaultJSON.temperatureUnit || 1;
  this.maxTemp = 90;
  this.minTemp = 60;
  this.targetRelativeHumidity = 90;
  this.currentRelativeHumidity = 90;
  this.targetTemperature = 25;
  this.currentTemperature = 20;
  this.targetHeatingCoolingState = 3;
  this.heatingCoolingState = 1;
  this.currentAirQualityCategory = 0;
  this.currentAirQualityValue = 0;

  this.service = new Service.Thermostat(this.name);

}

ThermostatZone.prototype = {

  identify: function(callback) {
    // this.log("Identify requested!");
    callback();
  },

  getTargetHeatingCoolingState: function(callback) {

    // this.log("[+] getTargerHeatingCoolingState from:", this.apiroute + defaultJSON.zone.apis.getState + this.id + "?apikey=" + this.apikey);

    //Status state
    var url = this.apiroute + defaultJSON.system.apis.getSystemOn + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
        callback(error);
      } else {

        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);return
        }
        this.on = (json.status == 0)? false : true
        if(!this.on) {
          this.targetHeatingCoolingState = 0
          callback(null, this.targetHeatingCoolingState);
        }
        else {
          // if(this.logZone) this.log('system ON')
          //Macrozone state
          var url = this.apiroute + defaultJSON.zone.apis.getMacrozone + this.id + "?apikey=" + this.apikey;
          util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
            if (error) {
              this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
              callback(error);
            } else {
              try{
                var json = JSON.parse(responseBody);
              }
              catch(err){
                callback(-1);return
              }
              var macrozoneid = json.macrozoneId
              var url = this.apiroute + defaultJSON.macrozone.apis.getState + macrozoneid + "?apikey=" + this.apikey;
              util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
                if (error) {
                  this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
                  callback(error);
                } else {
                  try{
                    var json = JSON.parse(responseBody);
                  }
                  catch(err){
                    callback(-1);return
                  }
                  // if(this.logZone) this.log('macrozone status', json)
                  if(!json.status){
                    this.targetHeatingCoolingState = 0;
                    callback(null, this.targetHeatingCoolingState);
                  }
                  else {
                    var url = this.apiroute + defaultJSON.zone.apis.getState + this.id + "?apikey=" + this.apikey;
                    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
                      if (error) {
                        this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
                        callback(error);
                      } else {
                        try{
                          var json = JSON.parse(responseBody);
                        }
                        catch(err){
                          callback(-1);return
                        }
                        // if(this.logZone) this.log('zone status', json)
                        if(json.status > 0 ) json.status = 3
                        this.targetHeatingCoolingState = json.status;
                        callback(null, this.targetHeatingCoolingState);
                      }
                    }.bind(this));
                  }
                }
              }.bind(this));
            }
          }.bind(this));
        }
      }
    }.bind(this));
  },

  setTargetHeatingCoolingState: function(value, callback) {
    if(!this.on){
      this.log("System OFF - Unable to change zone's state")
      callback();
      return
    }
    // this.log("[+] setTargetHeatingCoolingState from:", this.apiroute + defaultJSON.zone.apis.setState + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.setState + "?apikey=" + this.apikey;
    if(value == 3) value = 1
    var body = {
      id: this.id,
      value: value
    }
    util.httpRequest(url, body, 'PUT', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error setting targetHeatingCoolingState", error.message);
        callback(error);
      } else {
        this.log("[*] Sucessfully set targetHeatingCoolingState to %s", value);
        callback();
      }
    }.bind(this));
  },

  getCurrentTemperature: function(callback) {
    // this.log("[+] getCurrentTemperature from:", this.apiroute + defaultJSON.zone.apis.getCurrentTemperature + this.id + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.getCurrentTemperature + this.id + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error getting currentTemperature: %s", error.message);
        callback(error);
      } else {
        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);return
        }
          // this.log("Current Temperature: %s", json);
        if(json.value)  {
          if(json.value == -3276.8){
            this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(0);
            callback(-1, null);
          }
          else {
            this.currentTemperature = util.convertF2C(parseFloat(json.value), this.temperatureDisplayUnits)
            callback(null, this.currentTemperature);
          }
        }
        else {
          this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(0);
          // this.currentTemperature = util.convertF2C(1000, this.temperatureDisplayUnits)
          callback(-1, null);
        }
      }
    }.bind(this));
  },

  getTargetTemperature: function(callback) {

    // this.log("[+] getTargetTemperature from:", this.apiroute + defaultJSON.zone.apis.getTargetTemperature + this.id + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.getTargetTemperature + this.id + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error getting currentTemperature: %s", error.message);
        callback(error);
      } else {
        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);return
        }
        this.targetTemperature = util.convertF2C(json.value, this.temperatureDisplayUnits);
        if(this.logZone)
          this.log("Read value %s from Messana and converted to %s ", json.value, this.targetTemperature)
        callback(null, this.targetTemperature.toFixed(2));
      }
    }.bind(this));
  },

  setTargetTemperature: function(value, callback) {
    this.targetTemperature = util.convertC2F(value, this.temperatureDisplayUnits)
    if(this.logZone)
      this.log("Picked value %s from Home and converted to %s", value, this.targetTemperature)
    var url = this.apiroute + defaultJSON.zone.apis.setTargetTemperature + "?apikey=" + this.apikey
    var body = {
      id: this.id,
      value: this.targetTemperature
    }
    util.httpRequest(url, body, 'PUT', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error setting targetTemperature", error.message);
        callback(error);
      } else {
        // this.log("[*] Sucessfully set targetTemperature to %s", value);
        callback();
      }
    }.bind(this));
  },

  getCurrentRelativeHumidity: function(callback) {
    // this.log("[+] getCurrentRelativeHumidity from:", this.apiroute + defaultJSON.zone.apis.getHumidity + this.id + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.getHumidity + this.id + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error getting currentRelativeHumidity: %s", error.message);
        callback(error);
      } else {
        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);return
        }
	if(!json.value || json.value < 0){
          this.currentRelativeHumidity = 0;
          callback(null, this.currentRelativeHumidity);
        } else {
        this.currentRelativeHumidity = Math.round(parseFloat(json.value)-0.01);
        // this.log("[*] currentRelativeHumidity: %s", this.currentRelativeHumidity);
        callback(null, this.currentRelativeHumidity);
        }
      }
    }.bind(this));
  },

  getTargetRelativeHumidity: function(callback) {
    // this.log("[+] getTargetRelativeHumidity from:", this.apiroute + defaultJSON.zone.apis.getTargetHumidity + this.id + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.getTargetHumidity + this.id + "?apikey=" + this.apikey;
    // this.log(this.apiroute + defaultJSON.zone.apis.getTargetHumidity + this.id + "?apikey=" + this.apikey)
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error getting targetRelativeHumidity: %s", error.message);
        callback(error);
      } else {
        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);return
        }
        if(!json.value || json.value == 0){
          this.service.getCharacteristic(Characteristic.TargetRelativeHumidity).updateValue(this.targetRelativeHumidity);
          callback(null, this.targetRelativeHumidity);
        } else {
        this.targetRelativeHumidity = Math.round(parseFloat(json.value)-0.01);
        // this.log("[*] targetRelativeHumidity: %s", this.targetRelativeHumidity);
        callback(null, this.targetRelativeHumidity);
        }
      }
    }.bind(this));
  },

  setTargetRelativeHumidity: function(value, callback) {
    // this.log("[+] setTargetRelativeHumidity from %s to %s", this.setTargetHumidity, value);
    this.targetHumidity = value
    var url = this.apiroute + defaultJSON.zone.apis.setTargetHumidity + "?apikey=" + this.apikey
    // console.log(url)
    var body = { id: this.id, value: this.targetHumidity}
    util.httpRequest(url, body, 'PUT', function(error, response, responseBody) {
      if (error) {
        // this.log("[!] Error setting targetHumidity", error.message);
        callback(error);
      } else {
        // this.log("[*] Sucessfully set targetHumidity to %s", value);
        callback();
      }
    }.bind(this));
  },

  getTemperatureDisplayUnits: function(callback) {
    // this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
    callback(null, this.temperatureDisplayUnits);
  },

  setTemperatureDisplayUnits: function(value, callback) {
    // this.log("[*] setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
    this.temperatureDisplayUnits = 1;
    callback();
  },

  getName: function(callback) {
    // this.log("getName :", this.name);
    callback(null, this.name);
  },

  getServices: function() {
    // this.log("***** getServices *******");
    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.Manufacturer, util.staticValues.manufacturer)
      .setCharacteristic(Characteristic.SerialNumber, defaultJSON.version);

    this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', this.getTargetHeatingCoolingState.bind(this))
      .on('set', this.setTargetHeatingCoolingState.bind(this));

    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this));

    this.service
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', this.getTemperatureDisplayUnits.bind(this))
      .on('set', this.setTemperatureDisplayUnits.bind(this));


    this.service
      .getCharacteristic(Characteristic.Name)
      .on('get', this.getName.bind(this));

      this.service
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', this.getCurrentRelativeHumidity.bind(this));

      if(this.desiredRH) {
        this.service
          .getCharacteristic(Characteristic.TargetRelativeHumidity)
          .on('get', this.getTargetRelativeHumidity.bind(this))
          .on('set', this.setTargetRelativeHumidity.bind(this));
      }


    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minValue: -100,
        maxValue: 100,
        minStep: 0.1
      });

    // console.log(this.config, util.convertF2C(this.config.min || this.minTemp, this.temperatureDisplayUnits), util.convertF2C(this.config.max || this.maxTemp, this.temperatureDisplayUnits))
    var characteristic = this.service.getCharacteristic( Characteristic.TargetTemperature );
      characteristic
        .setProps({
          minValue: util.convertF2C(this.config.min || this.minTemp, this.temperatureDisplayUnits),
          maxValue: util.convertF2C(this.config.max  || this.maxTemp, this.temperatureDisplayUnits),
          minStep: 0.1
        });

    setInterval(function() {

      this.getTargetTemperature(function(err, temp) {
        if (err) {temp = err;}
        this.service.getCharacteristic(Characteristic.TargetTemperature).updateValue(temp);
      }.bind(this));

      this.getTargetHeatingCoolingState(function(err, temp) {
        if (err) { temp = err; }
        this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(temp);
      }.bind(this));

      this.getCurrentRelativeHumidity(function(err, temp) {
        if (err) { temp = err; }
        this.service.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(temp);
      }.bind(this));

      if(this.desiredRH) {
        this.getTargetRelativeHumidity(function(err, temp) {
          if (err) {temp = err;}
          this.service.getCharacteristic(Characteristic.TargetRelativeHumidity).updateValue(temp);
        }.bind(this));
      }

    }.bind(this), defaultJSON.refreshZone * 1000);

    this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).props.validValues = [0, 3];
    this.service.getCharacteristic( Characteristic.TemperatureDisplayUnits ).props.minValue = defaultJSON.temperatureUnit;

    return [this.informationService, this.service];
  }
};

function OptTemp(log, config, api) {
  this.apikey = util.getApiKey(api)
  this.log = log;
  this.config = config
  this.name = config.name;
  this.id = config.id;
  this.model = packageJSON.models[1];
  this.apiroute = util.staticValues.apiroute
  this.temperatureDisplayUnits = defaultJSON.temperatureUnit || 1;
  this.currentTemperature = 20;
  this.targetHeatingCoolingState = 3;
  this.heatingCoolingState = 1;

  this.service = new Service.TemperatureSensor(this.name);

}

OptTemp.prototype = {

  identify: function(callback) {
    // this.log("Identify requested!");
    callback();
  },
  getTargetHeatingCoolingState: function(callback) {

    // this.log("[+] getTargerHeatingCoolingState from:", this.apiroute + defaultJSON.zone.apis.getState + this.id + "?apikey=" + this.apikey);

    //Status state
    var url = this.apiroute + defaultJSON.system.apis.getSystemOn + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
        callback(error);
      } else {

        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);return
        }
        this.on = (json.status == 0)? false : true
        if(!this.on) {
          this.targetHeatingCoolingState = 0
          callback(null, this.targetHeatingCoolingState);
        }
        else {
          // if(this.logZone) this.log('system ON')
          //Macrozone state
          var url = this.apiroute + defaultJSON.zone.apis.getMacrozone + this.id + "?apikey=" + this.apikey;
          util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
            if (error) {
              this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
              callback(error);
            } else {
              try{
                var json = JSON.parse(responseBody);
              }
              catch(err){
                callback(-1);return
              }
              var macrozoneid = json.macrozoneId
              var url = this.apiroute + defaultJSON.macrozone.apis.getState + macrozoneid + "?apikey=" + this.apikey;
              util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
                if (error) {
                  this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
                  callback(error);
                } else {
                  try{
                    var json = JSON.parse(responseBody);
                  }
                  catch(err){
                    callback(-1);return
                  }
                  // if(this.logZone) this.log('macrozone status', json)
                  if(!json.status){
                    this.targetHeatingCoolingState = 0;
                    callback(null, this.targetHeatingCoolingState);
                  }
                  else {
                    var url = this.apiroute + defaultJSON.zone.apis.getState + this.id + "?apikey=" + this.apikey;
                    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
                      if (error) {
                        this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
                        callback(error);
                      } else {
                        try{
                          var json = JSON.parse(responseBody);
                        }
                        catch(err){
                          callback(-1);return
                        }
                        // if(this.logZone) this.log('zone status', json)
                        if(json.status > 0 ) json.status = 3
                        this.targetHeatingCoolingState = json.status;
                        callback(null, this.targetHeatingCoolingState);
                      }
                    }.bind(this));
                  }
                }
              }.bind(this));
            }
          }.bind(this));
        }
      }
    }.bind(this));
  },

  setTargetHeatingCoolingState: function(value, callback) {
    if(!this.on){
      this.log("System OFF - Unable to change zone's state")
      callback();
      return
    }
    // this.log("[+] setTargetHeatingCoolingState from:", this.apiroute + defaultJSON.zone.apis.setState + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.setState + "?apikey=" + this.apikey;
    if(value == 3) value = 1
    var body = {
      id: this.id,
      value: value
    }
    util.httpRequest(url, body, 'PUT', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error setting targetHeatingCoolingState", error.message);
        callback(error);
      } else {
        this.log("[*] Sucessfully set targetHeatingCoolingState to %s", value);
        callback();
      }
    }.bind(this));
  },

  getCurrentTemperature: function(callback) {
    // this.log("[+] getCurrentTemperature from:", this.apiroute + defaultJSON.zone.apis.getCurrentTemperature + this.id + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.getCurrentTemperature + this.id + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        // this.log("[!] Error getting currentTemperature: %s", error.message);
        callback(error);
      } else {
        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);
          return
        }
        if(!json.value || json.value == 0){
           this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(0);
          callback(-1, null);
        }
        else {
          this.currentTemperature = util.convertF2C(parseFloat(json.value), this.temperatureDisplayUnits)
          callback(null, this.currentTemperature.toFixed(2));
        }
      }
    }.bind(this));
  },

  getTemperatureDisplayUnits: function(callback) {
    // this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
    callback(null, this.temperatureDisplayUnits);
  },

  setTemperatureDisplayUnits: function(value, callback) {
    // this.log("[*] setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
    this.temperatureDisplayUnits = 1;
    callback();
  },

  getName: function(callback) {
    // this.log("getName :", this.name);
    callback(null, this.name);
  },

  getServices: function() {
    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.Manufacturer, util.staticValues.manufacturer)
      .setCharacteristic(Characteristic.SerialNumber, defaultJSON.version);

	 this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', this.getTargetHeatingCoolingState.bind(this))
      .on('set', this.setTargetHeatingCoolingState.bind(this));

	this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));

    this.service
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', this.getTemperatureDisplayUnits.bind(this))
      .on('set', this.setTemperatureDisplayUnits.bind(this));

    this.service
      .getCharacteristic(Characteristic.Name)
      .on('get', this.getName.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 0.5
      });

    setInterval(function() {

    }.bind(this), defaultJSON.refreshZone * 1000);

    this.service.getCharacteristic( Characteristic.TemperatureDisplayUnits ).props.minValue = defaultJSON.temperatureUnit;

    return [this.informationService, this.service];
  }
};

function AirQuality(log, config, api) {
  this.apikey = util.getApiKey(api)
  this.log = log;
  this.config = config
  this.name = config.name;
  this.id = config.id;
  this.model = packageJSON.models[2];
  this.apiroute = util.staticValues.apiroute
  this.currentAirQuality = config.currentAirQuality || 0;
  this.currentVOCValue = config.currentVOCValue || 0;
  this.serviceA = new Service.AirQualitySensor(this.name);
}

AirQuality.prototype = {

  identify: function(callback) {
    // this.log("Identify requested!");
    callback();
  },

  getAirQualityCategory: function(callback) {
   //  this.log("[+] getAirQualityCategory from:", this.apiroute + defaultJSON.zone.apis.getAirQuality + this.id + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.getAirQuality + this.id + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
          callback(-1, -1);
        return
      } else {
        // let characteristic = this.serviceA.getCharacteristic( Characteristic.AirQuality );
        try{
          var json = JSON.parse(responseBody);
      }
        catch(err){
        callback(-1);return
        }
        if(!json.category){
		callback(null,0);
        }
        else {
          if(json.category == 'Excellent') json.category = 1
          else if(json.category == 'Good') json.category = 2
          else if(json.category == 'Fair') json.category = 3
          else if(json.category == 'High') json.category = 5

          this.currentAirQualityCategory = json.category;
          callback(null, this.currentAirQualityCategory);
        }
      }
    }.bind(this));
  },

  getAirQualityValue: function(callback) {
    // this.log("[+] getAirQualityCategory from:", this.apiroute + defaultJSON.zone.apis.getAirQuality + this.id + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.getAirQuality + this.id + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error getting getAirQualityCategory: %s", error.message);
        callback(null, null);
        return
      } else {
        let characteristic = this.serviceA.getCharacteristic( Characteristic.AirQuality );
        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
	      callback(0,this.currentAirQualityValue);return
        }
  	 if(!json.value){
	this.currentAirQualityValue = 0; 
        	callback(null, this.currentAirQualityValue);
        } else {
        this.currentAirQualityValue = json.value;
        // this.log("[*] getAirQualityCategory: %s", this.currentAirQualityValue);
        callback(null, this.currentAirQualityValue);
	}
      }
    }.bind(this));
  },

  getVOCValue: function(callback) {
    // this.log("[+] getVOCValue from:", this.apiroute + defaultJSON.zone.apis.getVOC + this.id + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.getVOC + this.id + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        // this.log("[!] Error getting getAirQualityValue: %s", error.message);
        callback(error);
      } else {
        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);return
        }
	 if(!json.value || json.value < 0){
            this.currentVOCValue = 0;
            callback(null,this.currentVOCValue);
        } else {
           this.currentVOCValue = parseFloat(json.value);
           // this.log("[*] getVOCValue: %s", this.currentVOCValue);
           callback(null, this.currentVOCValue);
        }  

      }
    }.bind(this));
  },

  getName: function(callback) {
    // this.log("getName :", this.name);
    callback(null, this.name);
  },

  getServices: function() {
    // this.log("***** getServices *******");
    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.Manufacturer, util.staticValues.manufacturer)
      .setCharacteristic(Characteristic.SerialNumber, defaultJSON.version);

    this.serviceA
      .getCharacteristic(Characteristic.AirQuality)
      .on('get', this.getAirQualityCategory.bind(this));

    this.serviceA
      .getCharacteristic(Characteristic.AirParticulateDensity)
      .on('get', this.getAirQualityValue.bind(this))

    this.serviceA.getCharacteristic(Characteristic.VOCDensity)
      .on('get', this.getVOCValue.bind(this))

    this.serviceA.getCharacteristic(Characteristic.AirParticulateDensity)
      .setProps({
        minValue: 0,
        maxValue: 4000
      });

    // this.serviceA.getCharacteristic(Characteristic.VOCdensity)
    //   .setProps({
    //     minValue: 0,
    //     maxValue: 2100
    //   });

    setInterval(function() {

      this.getAirQualityCategory(function(err, temp) {
        if (err) {temp = err;}
        this.serviceA.getCharacteristic(Characteristic.AirQuality).updateValue(temp);
      }.bind(this));

      this.getAirQualityValue(function(err, temp) {
        if (err) {temp = err;}
        this.serviceA.getCharacteristic(Characteristic.AirParticulateDensity).updateValue(temp);
      }.bind(this));

      // this.getAirQualityValue(function(err, temp) {
      //   if (err) {temp = err;}
      //   this.serviceA.getCharacteristic(Characteristic.VOCdensity).updateValue(temp);
      // }.bind(this));

    }.bind(this), defaultJSON.refreshZone * 1000);

    return [this.informationService, this.serviceA];
  }
};

function RelHumidity(log, config, api) {
  this.apikey = util.getApiKey(api)
  this.log = log;
  this.config = config
  this.name = config.name;
  this.id = config.id;
  this.model = packageJSON.models[3];
  this.apiroute = util.staticValues.apiroute;
  this.currentRelativeHumidity = 90;
  this.service = new Service.HumiditySensor(this.name);

}

RelHumidity.prototype = {

  identify: function(callback) {
    // this.log("Identify requested!");
    callback();
  },

  getTargetHeatingCoolingState: function(callback) {

    // this.log("[+] getTargerHeatingCoolingState from:", this.apiroute + defaultJSON.zone.apis.getState + this.id + "?apikey=" + this.apikey);

    //Status state
    var url = this.apiroute + defaultJSON.system.apis.getSystemOn + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
        callback(error);
      } else {

        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);return
        }
        this.on = (json.status == 0)? false : true
        if(!this.on) {
          this.targetHeatingCoolingState = 0
          callback(null, this.targetHeatingCoolingState);
        }
        else {
          // if(this.logZone) this.log('system ON')
          //Macrozone state
          var url = this.apiroute + defaultJSON.zone.apis.getMacrozone + this.id + "?apikey=" + this.apikey;
          util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
            if (error) {
              this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
              callback(error);
            } else {
              try{
                var json = JSON.parse(responseBody);
              }
              catch(err){
                callback(-1);return
              }
              var macrozoneid = json.macrozoneId
              var url = this.apiroute + defaultJSON.macrozone.apis.getState + macrozoneid + "?apikey=" + this.apikey;
              util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
                if (error) {
                  this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
                  callback(error);
                } else {
                  try{
                    var json = JSON.parse(responseBody);
                  }
                  catch(err){
                    callback(-1);return
                  }
                  // if(this.logZone) this.log('macrozone status', json)
                  if(!json.status){
                    this.targetHeatingCoolingState = 0;
                    callback(null, this.targetHeatingCoolingState);
                  }
                  else {
                    var url = this.apiroute + defaultJSON.zone.apis.getState + this.id + "?apikey=" + this.apikey;
                    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
                      if (error) {
                        this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
                        callback(error);
                      } else {
                        try{
                          var json = JSON.parse(responseBody);
                        }
                        catch(err){
                          callback(-1);return
                        }
                        // if(this.logZone) this.log('zone status', json)
                        if(json.status > 0 ) json.status = 3
                        this.targetHeatingCoolingState = json.status;
                        callback(null, this.targetHeatingCoolingState);
                      }
                    }.bind(this));
                  }
                }
              }.bind(this));
            }
          }.bind(this));
        }
      }
    }.bind(this));
  },

  setTargetHeatingCoolingState: function(value, callback) {
    if(!this.on){
      this.log("System OFF - Unable to change zone's state")
      callback();
      return
    }
    // this.log("[+] setTargetHeatingCoolingState from:", this.apiroute + defaultJSON.zone.apis.setState + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.setState + "?apikey=" + this.apikey;
    if(value == 3) value = 1
    var body = {
      id: this.id,
      value: value
    }
    util.httpRequest(url, body, 'PUT', function(error, response, responseBody) {
      if (error) {
        this.log("[!] Error setting targetHeatingCoolingState", error.message);
        callback(error);
      } else {
        this.log("[*] Sucessfully set targetHeatingCoolingState to %s", value);
        callback();
      }
    }.bind(this));
  },
  getCurrentRelativeHumidity: function(callback) {
    // this.log("[+] getCurrentRelativeHumidity from:", this.apiroute + defaultJSON.zone.apis.getHumidity + this.id + "?apikey=" + this.apikey);
    var url = this.apiroute + defaultJSON.zone.apis.getHumidity + this.id + "?apikey=" + this.apikey;
    util.httpRequest(url, '', 'GET', function(error, response, responseBody) {
      if (error) {
        // this.log("[!] Error getting currentRelativeHumidity: %s", error.message);
        callback(error);
      } else {
        try{
          var json = JSON.parse(responseBody);
        }
        catch(err){
          callback(-1);return
        }
        if(!json.value || json.value == 0 || json.value < 0){
          this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(0);
          callback(-1, null);
        }
        else {
          this.currentRelativeHumidity = parseFloat(json.value);
          callback(null, this.currentRelativeHumidity);
        }
      }
    }.bind(this));
  },

  getName: function(callback) {
    // this.log("getName :", this.name);
    callback(null, this.name);
  },

  getServices: function() {
    // this.log("***** getServices *******");
    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.Manufacturer, util.staticValues.manufacturer)
      .setCharacteristic(Characteristic.SerialNumber, defaultJSON.version);

    this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', this.getTargetHeatingCoolingState.bind(this))
      .on('set', this.setTargetHeatingCoolingState.bind(this));

    this.service
      .getCharacteristic(Characteristic.Name)
      .on('get', this.getName.bind(this));

      this.service
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', this.getCurrentRelativeHumidity.bind(this));


    setInterval(function() {

    }.bind(this), defaultJSON.refreshZone * 1000);


    return [this.informationService, this.service];
  }
};