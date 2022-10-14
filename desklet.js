const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Soup = imports.gi.Soup;



class GrowattDesklet extends Desklet.Desklet {

    httpSession = new Soup.SessionAsync();
    
    login = false;
    statusOk = false;
    
    cookieStore = null;
    
    onePlantId = null;
    

    constructor(metadata, deskletId) {
        super(metadata, deskletId);
        this.metadata = metadata;

        this.settings = new Settings.DeskletSettings(this, this.metadata.uuid, this.instance_id);

        this.settings.bind('delay', 'delay', this.on_setting_changed);

        this.settings.bind('server', 'server', this.on_setting_changed);
        this.settings.bind('plantId', 'plantId', this.on_setting_changed);
        this.settings.bind('account', 'account', this.on_setting_changed);
        this.settings.bind('password', 'password', this.on_setting_changed);
        
        this.render();
        
        this.setUpdateTimer();
    }


    render() {

        this.setHeader(_('Growatt Monitor'));
      
        this.updated = new St.Label({});
        this.updated.set_text('Loading: ' + this.server + ' ...' );
        
//        this.window.add_actor(this.text);
        
       this.mainBox = new St.BoxLayout({
            vertical : true,
//            width : this.width,
//            height : this.height,
//            style_class : "quotes-reader"
        });
        
        if (this.dataBox == null ) {
          this.dataBox = new St.BoxLayout({ vertical: true});
        }
        
        this.mainBox.add(this.updated);
        this.mainBox.add(this.dataBox);

        this.setContent(this.mainBox);        
    
    }
    
    unrender() {
        this.mainBox.destroy_all_children();
        this.mainBox.destroy();        
    }
  
    removeUpdateTimer() {    
      if (this.updateLoopId) {
        Mainloop.source_remove(this.updateLoopId);
      }
    }

    on_desklet_removed() {
      this.removeUpdateTimer();  
    }
    
    
    __padTo2Digits(num) {
      return num.toString().padStart(2, '0');
    }

    __formatDate(date) {
      return (
        'GrowattMonitor@' + 
        [
          date.getFullYear(),
          this.__padTo2Digits(date.getMonth() + 1),
          this.__padTo2Digits(date.getDate()),
        ].join('-') +
        ' ' +
        [
          this.__padTo2Digits(date.getHours()),
          this.__padTo2Digits(date.getMinutes()),
          this.__padTo2Digits(date.getSeconds()),
        ].join(':')
      );
    }    

    onUpdate() {
    
        this.updated.set_text(this.__formatDate(new Date()));
        
        this.performStatusCheck();
        
        this.setUpdateTimer();
    
    }
        

    setUpdateTimer() {

        var timeOut = this.delay 
        if (!this.statusOk) {
          timeOut = 5;
        }
        //global.log('MonitorTO: ', timeOut);        
        this.updateLoopId = Mainloop.timeout_add_seconds(timeOut, Lang.bind(this, this.onUpdate));
    }
    
    
    //------------------------

    //HTTP request creator function
    /*
        This function creates all of our HTTP requests.
    */
    httpRequest(method,url,headers,postParameters,callbackF) {
        var message = Soup.Message.new(
            method,
            url
        );

        if (headers !== null) {
            for (let i = 0;i < headers.length;i++) {
                message.request_headers.append(headers[i][0],headers[i][1]);
            }
        }
        
        //if (this.gzipEnabled) {
        //    message.request_headers.append("Accept-Encoding","gzip");
        //}

        if (postParameters !== null) {
            message.set_request("application/x-www-form-urlencoded",2,postParameters);
        }
        
        if (this.cookieStore !== null) {
            Soup.cookies_to_request( this.cookieStore, message );
            
        }

        this.httpSession.queue_message(message,
            Lang.bind(this, function(session, response) {
            
                if (response.status_code !== Soup.KnownStatusCode.OK) {
                    global.log("growattMonitor: HTTPREQUESTERROR: ", response.status_code + " : " + response.response_body.data);
                }

                callbackF(this, message, message.response_body.data);
                return;
            })
        );
        return;
    }
    

    performLogin() {
      
        const url = this.server + '/login' ; 
        const data = 'account=' + this.account + '&password=' + this.password + '&validateCode=&isReadPact=0';
        
        this.httpRequest(
          'POST', 
          url, 
          null, 		// headers
          data, 		// postParams
          function(context, message, body) {

            if (message.status_code == Soup.KnownStatusCode.OK) {
                var result = JSON.parse(body);
                if (result.result==1) {
                  context.login = true;
                  
                  global.log('growattMonitor: Login: TRUE');
                  
                  const list = Soup.cookies_from_response(message);
                  
                  context.cookieStore = list;
                  
                  context.cookieStore.forEach( function(c) {
                    //global.log(c.name, c.value);
                    if (c.name=='onePlantId') {
                      //global.log('onePlantId set to: ', c.value);
                      context.onePlantId = c.value;
                    }
                  });
                  
                  
                }
            } else {
                context.login = false;
                context.cookieStore = null;
                global.log('growattMonitor: Login: FALSE');
            }
          }
        );
    }
    
    onStatusCheckData(context, dataobj) {

      context.dataBox.destroy_all_children();
      
      dataobj.datas.forEach( function(d, i) {      
        
          //global.log(d);

          var color = 'lightgreen';
          if (d.status = '-1') {
            color = 'red';
          }

          const labelPlantModel =  new St.Label({
            text : d.plantName + ' ('+d.deviceModel+' ' + (parseInt(d.nominalPower)/1000) +'kW, Id:'+d.plantId+')',
            style : "width: 30em; color: "+color+"; text-decoration-line: underline; text-shadow: 1px 1px;"
          });  
          context.dataBox.add(labelPlantModel);
          
          const labelPacToday =  new St.Label({
            text : '  - Pac: ' + d.pac +'kW  Today: ' + d.eToday + 'kWh    Month: ' + d.eMonth +'kWh   Total: '+d.eTotal +'kWh'   ,
            style : "width: 30em;"
          });  
          context.dataBox.add(labelPacToday);
                    
      });
      
          
    }
    
    
    performStatusCheck() {
    
        if (!this.login) {
          this.performLogin();
          return;
        }

        var plantId = this.plantId;
        if (plantId.length==0) {
          plantId = this.onePlantId;
        }
        //global.log('PlantId: ', plantId);
        const url = this.server + '/panel/getDevicesByPlantList?currPage=1&plantId=' + plantId; //1487530';
        
        this.httpRequest(
          'POST', 
          url, 
          null, 		// headers
          null, 		// postParams
          function(context, message, body) {
              if (message.status_code == Soup.KnownStatusCode.OK) {
                context.statusOk = true;
                var result = JSON.parse(body);
                context.onStatusCheckData(context,result.obj);
              } else {
                //context.statusOk = false;
              }
          }
          );
    
    }
    
    

}


function main(metadata, deskletId) {
  let grwDesklet = new GrowattDesklet(metadata, deskletId);
  return grwDesklet;
}
