/*
	TODO: add info @ translations
			http://developer.chrome.com/extensions/i18n.html
	TODO: if Interval>60000 → localStorage['…-TimerDelay']=Interval/60000
			+ similar changes in chrome.alarms.create()
	TIPS: if script gets killed while waiting for an operation, try:
	 → https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers?hl=pl#keep-sw-alive
*/
/*
 * FBnotifier by Kaligula
 *  a low-resource-consuming extension for Google Chrome browser
 *
 * Licence CC-BY-SA 3.0 Kaligula 2013+ (script)
 *  http://creativecommons.org/licenses/by-sa/3.0/
 *
 */


/*
 *  decoder by mattcasey on http://stackoverflow.com/a/13091266
 *  but slightly modified
 */
var decode_entities = (function() {
    // Remove HTML Entities
    var element = document.createElement('div');

    function decode_HTML_entities (str) {

        if(str && typeof str === 'string') {

            // Escape HTML before decoding for HTML Entities
            str = escape(str).replace(/%26/g,'&').replace(/%23/g,'#').replace(/%3B/g,';');

            element.innerHTML = str;
            str = element.innerText;
            element.innerText = '';
        }
        return unescape(str);
    }
    return decode_HTML_entities;
})();

/*
 *  console.log() with time on line beginning
 */
function clog(txt,type){
	type=(type||'info');
	var date=new Date();
	var ms = date.getMilliseconds();
	ms = ms<100 ? (ms<10?(ms==0?'000':'00'+ms):'0'+ms) : ms ;
	return console[type]( //default: console.info('…');
		'['+date.toLocaleTimeString()+'.'+ms+']',
		txt
	);
}

/*
 *  rolling button badge while connecting
 */
var waitBadgeTimer=[];
function waitBadge(){
	chrome.action.setBadgeBackgroundColor({color:[155,155,155,255]}); // grey
	var nr=window.setInterval(waitBadgeRoller,250);
	waitBadgeTimer.push( nr );
}
function waitBadgeRoller(){
	var arr=['/','–','\\','|'];
	if(this.cnt==undefined)this.cnt=0;
	chrome.action.setBadgeText({text:arr[this.cnt]});
	this.cnt=(this.cnt<3?this.cnt+1:0);
}
function clearTimer(){
	for (var i=0;i<waitBadgeTimer.length;i++){ //sometimes check is performed on start then old alarm goes off or two old alarms go off
		window.clearInterval(waitBadgeTimer[i]);
	}
	return i+' waitBadgeTimer interval'+(i==1?'':'s')+' cleared.';
}

// add listener before check, because while I was debugging the script,
// the alarm usually went off during check() and before the listener was added
// so the check didn't run at all
chrome.alarms.onAlarm.addListener(check);

/*
 *  TEMPORARY
 *  clear obsolete alarm 'reloadAlarm'
 */
if ( !chrome.storage.local.get(['FBnotifier-obsolete-reloadAlarm']) ) {
	chrome.alarms.get(
		'reloadAlarm',
		function(a){
			clog('Now I\'m trying to clear obsolete alarm \'reloadAlarm\':');
			if (typeof a=='object') {
				chrome.alarms.clear('reloadAlarm');
				clog('Cleared!');
			} else {
				clog('Not cleared:\ntypeof a == '+typeof a+'\na == '+a+'\nProbably it\'s not present anymore. Good!');
			}
			chrome.storage.local.set({'FBnotifier-obsolete-reloadAlarm' : 1}); // 1 = true = consider it done
		}
	);
}

/*
 *  window.onload function
 */
function start(){

	// read user settings
	const Interval = await (+(chrome.storage.local.get(['FBnotifier-settings-TimerDelay']))||300000); // 5 mins
	if (!chrome.storage.local.get(['FBnotifier-counter'])) chrome.storage.local.set({'FBnotifier-counter' : '0'});
	clog('I loaded user settings successfully!');

	// read or set 'checkAlarm'
	chrome.alarms.get(
		'checkAlarm',
		function(a){
			clog('I\'ll try to find out if \'checkAlarm\' is already set:');
			if (typeof a=='object') {
				clog('→ true!');
				/*var lastCheckTimeDiff = (Date.now()) - (+localStorage['FBnotifier-lastCheck']);
				var lastCheckWasLongAgo = ( lastCheckTimeDiff > 5*60*1000 ); //'long ago' is >5mins
				if (lastCheckWasLongAgo){
					clog('But last check was '+lastCheckTimeDiff/1000+'s ago. Checking anyway.');
					check();
				}*/
				chrome.alarms.create('checkAlarm', {periodInMinutes:Interval/60000});
			} else {
				clog('→ false. I\'m going to set it now.');
				// chrome.alarms.create('checkAlarm', {delayInMinutes:Interval/60000,periodInMinutes:Interval/60000});
				chrome.alarms.create(
					'checkAlarm',
					{
						when:Date.now()+5000,
						periodInMinutes:Interval/60000
					}
				);
				clog('Alarm set.');
			}
		}
	);
}

/*
 * get all alarms
 */
function getAlarms(){
	chrome.alarms.getAll(
		function(a){
			var l=a.length;
			clog(l+' alarm'+(l>1?'s':'')+':');
			for (var i=1;i<=l;i++){
				clog('→ time of '+i+(i==1?'st':(i==2?'nd':(i==3?'rd':(i>3?'th':''))))+': '+new Date(a[0].scheduledTime));
			}
			clog(a);
		}
	);
}


chrome.storage.local.set({'alreadyChecking' : false});
/*
 *  check if Facebook is already on active tab
 */
function check(){
	var alreadyChecking = await chrome.storage.local.get(['alreadyChecking']);
	if (!alreadyChecking){
		var btnClkd = await chrome.storage.local.get(['btnClkd']);
		if (!btnClkd){ // button not clicked
			clog('Alarm went off. Checking if Facebook is on active tab.');
			chrome.tabs.query({'active':true},function(tab){
				var g=tab[0].url.indexOf('facebook.com');
				clog('Active tab[0] object:');
				console.log(tab[0]);
				clog('tab[0].url.indexOf(\'facebook.com\')=='+g);
				if(g==-1||g>12){ //'facebook.com' may be at most at 13th place: [https://www.f] <- 'f' is 13th char
					clog('Connecting…');
					var now=new Date();
					//localStorage['FBnotifier-lastCheck'] = now.valueOf();
					chrome.action.setTitle({title:'Connecting ('+now.toLocaleTimeString()+')'});
					waitBadge();
					checkNotifications();
				} else {
					clog('Assuming Facebook is on selected tab[0], so check is not performed.');
					clearButton();
					clog('Counters cleared.');
				}
			});
		} else { // button clicked
			clog('Alarm went off but meantime button was clicked. Not checking.');
			chrome.storage.local.set({'btnClkd' : false});
		}
	} else {
		clog('alreadyChecking == '+alreadyChecking);
	}
}

/*
 *  get Facebook page and check/count notifications
 */
function checkNotifications(){
	chrome.storage.local.set({'alreadyChecking' : true});
	clog('Getting page…');
	const Protocol = await (chrome.storage.local.get(['FBnotifier-settings-Https'])=='false')?'http:':'https:';
	const response = await fetch(Protocol+'//mbasic.facebook.com/menu/bookmarks/'); // this page on FB has relatively least size (Chrome console: 20.8 KB resources, 9.7 KB transfered)

			clog( clearTimer() );

			if(response.statusText.match('<div id="viewport"')){
				
				chrome.action.setIcon({path:'images/icon.png'});

				var fReqRX=response.statusText.match(/(?:<a accesskey="\d+" href="\/friends.*?>)([^<].*?)(?:(?:<\/a>)|(?:<.*?>\()(\d+)(?:\)<.*?><\/a>))/);
					var fReq= ( fReqRX ? (+(fReqRX[2])||0) : 0 );
				var fMesRX=response.statusText.match(/(?:<a accesskey="\d+" href="\/messages.*?>)([^<].*?)(?:(?:<\/a>)|(?:<.*?>\()(\d+)(?:\)<.*?><\/a>))/);
					var fMes= ( fMesRX ? (+(fMesRX[2])||0) : 0 );
				var fNotRX=response.statusText.match(/(?:<a accesskey="\d+" href="\/notifications.*?>)([^<].*?)(?:(?:<\/a>)|(?:<.*?>\()(\d+)(?:\)<.*?><\/a>))/);
					var fNot= ( fNotRX ? (+(fNotRX[2])||0) : 0 );
				
				var counter=fReq+fMes+fNot;
				clog('Check performed, '+counter+' notification'+(counter==1?'':'s')+'(fReq='+fReq+'|fMes='+fMes+'|fNot='+fNot+').');

				if (counter>0) {
					var badgeTitle='Online ('+(new Date()).toLocaleTimeString()+')';
						if (fReq>0) badgeTitle+='\n – '+decode_entities(fReq+' '+fReqRX[1]);
						if (fMes>0) badgeTitle+='\n – '+decode_entities(fMes+' '+fMesRX[1]);
						if (fNot>0) badgeTitle+='\n – '+decode_entities(fNot+' '+fNotRX[1]);
					chrome.action.setTitle({title:badgeTitle});
					chrome.action.setBadgeText({text:''+counter});
					chrome.action.setBadgeBackgroundColor({color:[208,0,24,255]}); // GMail red // it was green rgb(0,204,51) before
					clog('Button properties have been set.');
					const Sound = await (chrome.storage.local.get(['FBnotifier-settings-PlayRingtone'])=='false')?false:true;
					if (Sound && (counter>(+(chrome.storage.local.get(['FBnotifier-counter']))))) {
						const Ringtone = new Audio('notif.mp3');
						clog('Ringtone plays…');
						Ringtone.play();
						clog('…ringtone played.');
					}
					chrome.storage.local.set({'FBnotifier-counter' : counter});
				} else {
					clog('Clearing button.');
					clearButton();
				}
			} else {
				clog('response.statusText doesn\'t match string \"notifications_jewel\".','error')
				chrome.action.setIcon({path:'images/icon-offline.png'});
				chrome.action.setTitle({title:'Disconnected ('+(new Date()).toLocaleTimeString()+')'});
				chrome.action.setBadgeBackgroundColor({color:[155,155,155,255]}); //grey
				chrome.action.setBadgeText({text:'?'});
				clog('Button properties set as \"Disconnected\".');
				return;
			}
			chrome.storage.local.set({'alreadyChecking' : false});

}

/*
 *  restore blank button badge and counter=0
 */
function clearButton() {
	chrome.action.setBadgeText({text:''});
	chrome.action.setTitle({title:'Last check ('+(new Date()).toLocaleTimeString()+')'});
	chrome.storage.local.set({'FBnotifier-counter' : '0'});
	clearInterval(waitBadgeTimer);
	clog('Button cleared.');
}

/*
 *  button onClick event
 */
chrome.storage.local.set({'btnClkd' : false});
chrome.action.onClicked.addListener(function(tab){
	clog('Button clicked.');
	chrome.storage.local.set({'btnClkd' : true});
	const Protocol = await (chrome.storage.local.get(['FBnotifier-settings-Https'])=='false')?'http:':'https:';
	var uri=Protocol+'//www.facebook.com/';
	chrome.windows.getAll({populate:true},function(windows){
		const UseNewTab = await (chrome.storage.local.get(['FBnotifier-settings-UseNewTab'])=='true')?true:false;
		if (!UseNewTab){
			clog('Looking for opened Facebook tab. Otherwise will open Facebook in new tab.');
			for(var i=0;i<windows.length;i++){
				var tabs=windows[i].tabs;
				for(var j=0;j<tabs.length;j++){
					var g=tabs[j].url.indexOf('facebook.com');
					if(g>-1&&g<13){
						chrome.tabs.update(tabs[j].id,{selected:true});
						clog('Found first Facebook tab in '+i+'window and '+j+' tab.');
						return;
					}
				}
			}
		}
		clog('Opening Facebook in new tab (or active newtab).');
		chrome.tabs.query({'active':true},function(tab){
			if(tab[0].url=='chrome://newtab/'){
				chrome.tabs.update(tab[0].id,{url:uri});
			}
			else {
				chrome.tabs.create({url:uri,selected:true});
			}
		});
	});
	clearButton();
});

window.onload=start;