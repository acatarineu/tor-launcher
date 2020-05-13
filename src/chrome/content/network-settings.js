// Copyright (c) 2020, The Tor Project, Inc.
// See LICENSE for licensing information.
//
// vim: set sw=2 sts=2 ts=8 et syntax=javascript:

// TODO: if clean start and "Unable to read Tor settings" error is displayed, we should not bootstrap Tor or start the browser.

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TorLauncherUtil",
                          "resource://torlauncher/modules/tl-util.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TorLauncherLogger",
                          "resource://torlauncher/modules/tl-logger.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TorLauncherBridgeDB",
                          "resource://torlauncher/modules/tl-bridgedb.jsm");

const kPrefPromptForLocale = "extensions.torlauncher.prompt_for_locale";
const kPrefLocale = "intl.locale.requested";
const kPrefMatchOSLocale = "intl.locale.matchOS";

// The recommended type is listed first in the dropdown menu.
const kPrefDefaultBridgeRecommendedType =
                   "extensions.torlauncher.default_bridge_recommended_type";
const kPrefDefaultBridgeType = "extensions.torlauncher.default_bridge_type";

// The type of bridges to request from BridgeDB via Moat.
const kPrefBridgeDBType = "extensions.torlauncher.bridgedb_bridge_type";

// The bridges that we receive from BridgeDB via Moat are stored as
// extensions.torlauncher.bridgedb_bridge.0,
// extensions.torlauncher.bridgedb_bridge.1, and so on.
const kPrefBranchBridgeDBBridge = "extensions.torlauncher.bridgedb_bridge.";

const kSupportURL = "support.torproject.org/#connectingtotor";

const kTorProcessReadyTopic = "TorProcessIsReady";
const kTorProcessExitedTopic = "TorProcessExited";
const kTorProcessDidNotStartTopic = "TorProcessDidNotStart";
const kTorShowProgressPanelTopic = "TorShowProgressPanel";
const kTorBootstrapStatusTopic = "TorBootstrapStatus";
const kTorBootstrapErrorTopic = "TorBootstrapError";
const kTorLogHasWarnOrErrTopic = "TorLogHasWarnOrErr";

const kWizardFirstPageID = "first";
const kWizardDiscardSettingsPageID = "discardSettings";
const kWizardProgressPageID = "progress";                 // wizard
const kNetworkSettingsProgressPanelID = "progressPanel";  // non wizard

const kLocaleList = "localeList";
const kUseProxyCheckbox = "useProxy";
const kProxyTypeMenulist = "proxyType";
const kProxyAddr = "proxyAddr";
const kProxyPort = "proxyPort";
const kProxyUsername = "proxyUsername";
const kProxyPassword = "proxyPassword";
const kUseFirewallPortsCheckbox = "useFirewallPorts";
const kFirewallAllowedPorts = "firewallAllowedPorts";
const kUseBridgesCheckbox = "useBridges";
const kDefaultBridgesRadio = "bridgeRadioDefault";
const kDefaultBridgeTypeMenuList = "defaultBridgeType";
const kBridgeDBBridgesRadio = "bridgeRadioBridgeDB";
const kBridgeDBContainer = "bridgeDBContainer";
const kBridgeDBRequestButton = "bridgeDBRequestButton";
const kBridgeDBResult = "bridgeDBResult";
const kCustomBridgesRadio = "bridgeRadioCustom";
const kBridgeList = "bridgeList";
const kCopyLogFeedbackPanel = "copyLogFeedbackPanel";

// BridgeDB Moat request overlay (for interaction with a CAPTCHA challenge).
const kBridgeDBRequestOverlay = "bridgeDBRequestOverlay";
const kBridgeDBPrompt = "bridgeDBPrompt";
const kBridgeDBCaptchaImage = "bridgeDBCaptchaImage";
const kCaptchaImageTransition = "height 250ms ease-in-out";
const kBridgeDBCaptchaSolution = "bridgeDBCaptchaSolution";
const kBridgeDBCaptchaError = "bridgeDBCaptchaError";
const kBridgeDBSubmitButton = "bridgeDBSubmitButton";
const kBridgeDBCancelButton = "bridgeDBCancelButton";
const kBridgeDBReloadCaptchaButton = "bridgeDBReloadCaptchaButton";
const kBridgeDBNetworkActivity = "bridgeDBNetworkActivity";

// Custom event types.
const kCaptchaSubmitEventType = "TorLauncherCaptchaSubmitEvent";
const kCaptchaCancelEventType = "TorLauncherCaptchaCancelEvent";
const kCaptchaReloadEventType = "TorLauncherCaptchaReloadEvent";

// Tor SETCONF keywords.
const kTorConfKeyDisableNetwork = "DisableNetwork";
const kTorConfKeySocks4Proxy = "Socks4Proxy";
const kTorConfKeySocks5Proxy = "Socks5Proxy";
const kTorConfKeySocks5ProxyUsername = "Socks5ProxyUsername";
const kTorConfKeySocks5ProxyPassword = "Socks5ProxyPassword";
const kTorConfKeyHTTPSProxy = "HTTPSProxy";
const kTorConfKeyHTTPSProxyAuthenticator = "HTTPSProxyAuthenticator";
const kTorConfKeyReachableAddresses = "ReachableAddresses";
const kTorConfKeyUseBridges = "UseBridges";
const kTorConfKeyBridgeList = "Bridge";

var gProtocolSvc = null;
var gTorProcessService = null;
var gObsService = null;
var gCancelLabelStr = undefined;
var gIsInitialBootstrap = false;
var gInitialPanelID = undefined;
var gShowProgressTimer = undefined;
var gRestoreAfterHelpPanelID = null;
var gIsPostRestartBootstrapNeeded = false;
var gIsWindowScheduledToClose = false;
var gActiveTopics = [];  // Topics for which an observer is currently installed.
var gBridgeDBBridges = undefined; // Array of bridge lines.
var gBridgeDBRequestEventListeners = [];


function initDialogCommon()
{
  loadSharedXUL();

  gObsService = Cc["@mozilla.org/observer-service;1"]
                  .getService(Ci.nsIObserverService);

  let isWindows = TorLauncherUtil.isWindows;
  if (isWindows)
    document.documentElement.setAttribute("class", "os-windows");
  else if (TorLauncherUtil.isMac)
    document.documentElement.setAttribute("class", "os-mac");

  let forAssistance = document.getElementById("forAssistance");
  if (forAssistance)
  {
    forAssistance.textContent = TorLauncherUtil.getFormattedLocalizedString(
                                        "forAssistance2", [kSupportURL], 1);
  }

  let wizardElem = getWizard();
  let haveWizard = (wizardElem != null);

  let cancelBtn = getButton("cancel");
  if (cancelBtn)
  {
    gCancelLabelStr = cancelBtn.label;
    if (haveWizard)
    {
      let quitKey = isWindows ? "quit_win" : "quit";
      cancelBtn.label = TorLauncherUtil.getLocalizedString(quitKey);
    }
  }

  if (haveWizard)
  {
    // Apply styles to elements within the wizard element's shadow DOM.
    let wizardPageBox = wizardElem.shadowRoot.querySelector(".wizard-page-box");
    if (wizardPageBox)
    {
      wizardPageBox.style.padding = "0px";
      wizardPageBox.style.margin = "14px 20px 18px 20px";
    }

    let wizardHeader = wizardElem.shadowRoot.querySelector(".wizard-header");
    if (wizardHeader)
      wizardHeader.style.display = "none";

    // Hide the Tor Browser logo and associated separator element if the
    // TOR_HIDE_BROWSER_LOGO environment variable is set.
    let env = Cc["@mozilla.org/process/environment;1"]
                .getService(Ci.nsIEnvironment);
    if (env.exists("TOR_HIDE_BROWSER_LOGO"))
      wizardElem.setAttribute("tor_hide_browser_logo", true);

    // Add wizard event listeners.
    document.addEventListener("wizardcancel", (aEvent) => {
      if (!onCancel())
        aEvent.preventDefault();
    });

    document.addEventListener("pageadvanced", (aEvent) => {
      if ("helpPanel" == wizardElem.currentPage.pageid)
      {
        closeHelp();
        aEvent.preventDefault();
      }
    });

    document.addEventListener("pageshow", (aEvent) => {
      if (kWizardProgressPageID == wizardElem.currentPage.pageid)
        onShowProgressPanel();
    });

    document.addEventListener("pagehide", (aEvent) => {
      if (kWizardProgressPageID == wizardElem.currentPage.pageid)
        resetProgressNavButtons();
    });

    document.addEventListener("extra2", (aEvent) => {
      onCopyLog();
    });
  }
  else
  {
    // Add network settings dialog event listeners.
    document.addEventListener("dialogaccept", (aEvent) => {
      if (!onNetworkSettingsFinish())
        aEvent.preventDefault();
    });

    document.addEventListener("dialogcancel", (aEvent) => {
      if (!onCancel())
        aEvent.preventDefault();
    });

    document.addEventListener("dialogextra2", (aEvent) => {
      onCopyLog();
    });
  }
}


function loadSharedXUL()
{
  let ctxt = {};
  Services.scriptloader.loadSubScript(
    "chrome://torlauncher/content/network-settings-shared.js", ctxt);

  let elementIDs =
  [
     "proxySettings",
     "proxyHelpContent",
     "bridgeSettings",
     "bridgeHelpContent",
     "progressContent",
     "restartContent",
     "bridgeDBRequestOverlayContent",
     "errorOverlayContent",
     "copyLogFeedbackPanel",
  ];

  let entityURLs = ["chrome://torlauncher/locale/network-settings.dtd"];
  elementIDs.forEach(aID =>
  {
    let node = document.getElementById(aID);
    if (node)
    {
      let xulStr = ctxt[aID];
      let frag = window.MozXULElement.parseXULToFragment(xulStr, entityURLs);
      node.parentNode.replaceChild(frag, node);
    }
  });
}


function resizeDialogToFitContent()
{
  // Resize this window to fit content.  sizeToContent() alone will not do
  // the job (it has many limitations and it is buggy).
  sizeToContent();
  let w = maxWidthOfContent();
  if (w)
  {
    let windowFrameWidth = window.outerWidth - window.innerWidth;
    w += windowFrameWidth;

    if (w > window.outerWidth)
      window.resizeTo(w, window.outerHeight);
  }
}


function initDialog()
{
  gIsInitialBootstrap = window.arguments[0];
  initDialogCommon();

  if (window.arguments.length > 1)
    gInitialPanelID = window.arguments[1];

  try
  {
    let svc = Cc["@torproject.org/torlauncher-protocol-service;1"]
                .getService(Ci.nsISupports);
    gProtocolSvc = svc.wrappedJSObject;
  }
  catch (e) { dump(e + "\n"); }

  try
  {
    let svc = Cc["@torproject.org/torlauncher-process-service;1"]
                .getService(Ci.nsISupports);
    gTorProcessService = svc.wrappedJSObject;
  }
  catch (e) { dump(e + "\n"); }

  let wizardElem = getWizard();
  let haveWizard = (wizardElem != null);
  if (haveWizard)
  {
    // Add wizardfinish event handler.
    document.addEventListener("wizardfinish", (aEvent) => {
      if (!onWizardFinish())
        aEvent.preventDefault();
    });

    // Relabel the accept button to be "Connect"
    let okBtn = getButton("accept");
    if (okBtn)
      okBtn.label = TorLauncherUtil.getLocalizedString("connect");

    // Set "Copy Tor Log" label and move it after the Quit (cancel) button.
    let copyLogBtn = getButton("extra2");
    if (copyLogBtn)
    {
      copyLogBtn.label = wizardElem.getAttribute("buttonlabelextra2");
      let cancelBtn = getButton("cancel");
      if (cancelBtn && TorLauncherUtil.isMac)
        cancelBtn.parentNode.insertBefore(copyLogBtn, cancelBtn.nextSibling);
    }

    if (gTorProcessService.TorBootstrapErrorOccurred ||
        gProtocolSvc.TorLogHasWarnOrErr)
    {
      showCopyLogButton(true);
    }

    // Use "Connect" as the finish button label (on the last wizard page).
    let finishBtn = getButton("finish");
    if (finishBtn)
    {
      finishBtn.label = TorLauncherUtil.getLocalizedString("connect");
      finishBtn.removeAttribute("default"); // We do not want a default button.
    }

    // Set Discard Settings back button label to match the wizard Back button.
    let wizardBackBtn = getButton("back");
    let backBtn = document.getElementById("discardSettingsGoBack");
    if (wizardBackBtn && backBtn)
      backBtn.label = wizardBackBtn.label;
  }

  initDefaultBridgeTypeMenu();

  addObserver(kTorBootstrapStatusTopic);
  addObserver(kTorBootstrapErrorTopic);
  addObserver(kTorLogHasWarnOrErrTopic);
  addObserver(kTorProcessExitedTopic);
  addObserver(kTorShowProgressPanelTopic);

  let status = gTorProcessService.TorProcessStatus;
  if (TorLauncherUtil.shouldStartAndOwnTor &&
     (status != gTorProcessService.kStatusRunning))
  {
    if (status == gTorProcessService.kStatusExited)
      showRestartPanel();
    else
      showStartingTorPanel();
    addObserver(kTorProcessReadyTopic);
    addObserver(kTorProcessDidNotStartTopic);
  }
  else
  {
    onTorStarted();
  }

  if (haveWizard)
  {
    onWizardPageShow();
    document.addEventListener("pageshow",
                              aEvent => { onWizardPageShow(); }, false);
  }

  resizeDialogToFitContent();

  TorLauncherLogger.log(2, "initDialog done");
}


function initLocaleDialog()
{
  initDialogCommon();

  // Add wizardfinish event handler.
  document.addEventListener("wizardfinish", (aEvent) => {
    setLocale();
  });

  // Replace the finish button's label ("Done") with the next button's
  // label ("Next" or "Continue").
  let nextBtn = getButton("next");
  let doneBtn = getButton("finish");
  if (nextBtn && doneBtn)
    doneBtn.label = nextBtn.label;

  // The locale picker does not use the "Back" and "Next" buttons; hide them.
  let backBtn = getButton("back");
  if (backBtn)
    backBtn.style.display = "none";
  if (nextBtn)
    nextBtn.style.display = "none";

  let { AddonManager } = Cu.import("resource://gre/modules/AddonManager.jsm");
  let addonsPromise = AddonManager.getAddonsByTypes(["locale"]);
  addonsPromise.then(aLangPackAddons =>
      {
        populateLocaleList(aLangPackAddons);
        resizeDialogToFitContent();
        TorLauncherLogger.log(2, "initLocaleDialog done");
      });
}


function populateLocaleList(aLangPackAddons)
{
  let knownLanguages = {
    "en-US" : "English",
    "ar"    : "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
    "bn-BD" : "\u09ac\u09be\u0982\u09b2\u09be",
    "ca"    : "català",
    "cs"    : "\u010De\u0161tina",
    "da"    : "Dansk",
    "de"    : "Deutsch",
    "el"    : "\u03B5\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC",
    "es-ES" : "Espa\u00f1ol",
    "es-AR" : "Espa\u00f1ol de Argentina",
    "fa"    : "\u0641\u0627\u0631\u0633\u06cc",
    "fr"    : "Fran\u00e7ais",
    "ga"    : "Gaeilge (Irish)",
    "he"    : "\u05e2\u05d1\u05e8\u05d9\u05ea",
    "hu"    : "Magyar nyelv",
    "id"    : "bahasa Indonesia",
    "is"    : "\u0355slenska",
    "it"    : "Italiano",
    "ja"    : "\u65e5\u672c\u8a9e",
    "ka"    : "\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8",
    "ko"    : "\ud55c\uad6d\uc5b4",
    "lt"    : "Lietuvi\u0173",
    "mk"    : "\u041c\u0430\u043a\u0435\u0434\u043e\u043d\u0441\u043a\u0438",
    "ms"    : "Melayu",
    "nl"    : "Nederlands",
    "nb"    : "Norsk bokmå\u0345l",
    "pl"    : "Polski",
    "pt-PT" : "Portugu\u00eas (Europeu)",
    "ro"    : "Rom\u00e2n\u0103",
    "ru"    : "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
    "sv"    : "Svenska",
    "th"    : "\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22",
    "tr"    : "T\u00fcrk\u00e7e",
    "vi"    : "Ti\u1ebfng Vi\u1ec7t",
    "zh-CN" : "\u7b80\u4f53\u5b57",
    "zh-TW" : "\u6b63\u9ad4\u5b57"
  };

  // Retrieve the current locale so we can select it within the list by default.
  let curLocale = Services.locale.requestedLocale;
  if (curLocale)
    curLocale = curLocale.toLowerCase();

  // Build a list of language info objects (language code plus friendly name).
  let foundCurLocale = false;
  let langInfo = [];
  for (let addon of aLangPackAddons)
  {
    let uri = addon.getResourceURI("");
    // The add-on IDs look like langpack-LANGCODE@firefox.mozilla.org
    let matchResult = addon.id.match(/^langpack-(.*)@.*\.mozilla\.org/);
    let code = (matchResult) ? matchResult[1] : addon.id;
    if (code == "ja-JP-mac")
      code = "ja";
    let name = knownLanguages[code];
    if (!name)
    {
      // We do not have a name for this language pack. Use some heuristics.
      name = addon.name;
      let idx = name.lastIndexOf(" Language Pack");
      if (idx > 0)
        name = name.substring(0, idx);
    }
    let isSelected = (curLocale && (code.toLowerCase() == curLocale));
    langInfo.push({ langCode: code, langName: name, isSelected: isSelected } );
    if (isSelected && !foundCurLocale)
      foundCurLocale = true;
  }

  // Sort by language code.
  langInfo.sort(function(aObj1, aObj2) {
      if (aObj1.langCode == aObj2.langCode)
        return 0;

      return (aObj1.langCode < aObj2.langCode) ? -1 : 1;
    });

  // Add en-US to the beginning of the list.
  let code = "en-US";
  let name = knownLanguages[code];
  let isSelected = !foundCurLocale;  // select English if nothing else matched
  langInfo.splice(0, 0,
                  { langCode: code, langName: name, isSelected: isSelected });

  // Populate the XUL richlistbox.
  let localeList = document.getElementById(kLocaleList);
  for (let infoObj of langInfo)
  {
    let listItem = document.createXULElement("richlistitem");
    listItem.setAttribute("value", infoObj.langCode);
    let label = document.createXULElement("label");
    label.value = infoObj.langName;
    listItem.appendChild(label);
    localeList.appendChild(listItem);
    if (infoObj.isSelected)
      localeList.selectedItem = listItem;
  }
}


function deinitDialog()
{
  removeAllObservers();
}


// For now, we assume that the wizard buttons are the widest portion.
// TODO: return a value for the settings dialog (non-wizard case).
function maxWidthOfContent()
{
  let haveWizard = (getWizard() != null);
  if (!haveWizard)
    return undefined;

  // Show all buttons so we can get an accurate width measurement.
  // They will be hidden, as necessary, by the wizard.
  let buttons = "back,next,cancel,extra2".split(',');
  for (let i = 0; i < buttons.length; ++i)
    showOrHideButton(buttons[i], true, false);

  let btn = getButton("cancel");
  let btnContainer = btn.parentElement;

  const kWarningIconWidth = 20; // skin/warning.png is 16 plus some margin
  let r = btnContainer.getBoundingClientRect();

  // Hide copy log button if appropriate.
  restoreCopyLogVisibility();

  return Math.ceil((2 * r.left) + r.width + kWarningIconWidth);
}


function onWizardPageShow()
{
  let wizardElem = getWizard();
  // Update page title.
  let title = wizardElem.currentPage.getAttribute("windowtitle");
  if (!title)
    title = wizardElem.getAttribute("defaulttitle");
  document.title = title;

  // Hide or show navigation buttons as appropriate.
  // setTimeout() is needed for the first panel that is displayed.
  let val = wizardElem.currentPage.getAttribute("torShowNavButtons");
  setTimeout(function() {
      showOrHideButton("back", (val == "true"), false);

      // The "next" button is only used by the help wizard panel.
      let isShowingHelp = (wizardElem.currentPage.pageid == "helpPanel");
      showOrHideButton("next", isShowingHelp, false);
  }, 0);
}


function isShowingProgress()
{
  let wizardElem = getWizard();
  if (wizardElem)
    return (kWizardProgressPageID == wizardElem.currentPage.pageid);

  let deckElem = document.getElementById("deck");
  if (deckElem)
    return (kNetworkSettingsProgressPanelID == deckElem.selectedPanel.id);

  return false;
}


function getWizard()
{
  let elem = document.getElementById("TorNetworkSettings");
  if (!elem)
    elem = document.getElementById("TorLauncherLocalePicker");
  return (elem && (elem.tagName == "wizard")) ? elem : null;
}


function onWizardFirstPanelConnect()
{
  // If the user configured bridge or proxy settings, prompt before
  // discarding their data.
  if (isBridgeConfigured() || isProxyConfigured())
    showPanel(kWizardDiscardSettingsPageID);
  else
    removeSettingsAndConnect()
}


function removeSettingsAndConnect()
{
  applySettings(true);  // Use default settings.
  if (!gTorProcessService.TorIsBootstrapDone)
    readTorSettings();  // Ensure UI matches the settings that were used.
}


function onWizardConfigure()
{
  getWizard().advance("configureSettings");
}


function onCustomBridgesTextInput()
{
  var customBridges = document.getElementById(kCustomBridgesRadio);
  if (customBridges)
    customBridges.control.selectedItem = customBridges;
  onBridgeTypeRadioChange();
}


function onBridgeTypeRadioChange()
{
  let useBridgeDB = getElemValue(kBridgeDBBridgesRadio, false);
  let useCustom = getElemValue(kCustomBridgesRadio, false);
  let useDefault = !useBridgeDB && !useCustom;
  setBoolAttrForElemWithLabel(kDefaultBridgeTypeMenuList, "hidden",
                              !useDefault);
  setBoolAttrForElemWithLabel(kBridgeDBContainer, "hidden", !useBridgeDB);
  setBoolAttrForElemWithLabel(kBridgeList, "hidden", !useCustom);

  let focusElemID;
  if (useBridgeDB)
    focusElemID = kBridgeDBRequestButton;
  else if (useCustom)
    focusElemID = kBridgeList;
  else
    focusElemID = kDefaultBridgeTypeMenuList;

  let elem = document.getElementById(focusElemID);
  if (elem)
    elem.focus();
}


function onOpenBridgeDBRequestPrompt()
{
  // Obtain the meek client path and args from the tor configuration.
  let reply = gProtocolSvc.TorGetConf("ClientTransportPlugin");
  if (!gProtocolSvc.TorCommandSucceeded(reply))
    return;

  let meekClientPath;
  let meekTransport;  // We support both "meek" and "meek_lite".
  let meekClientArgs;
  reply.lineArray.forEach(aLine =>
  {
    // Parse each ClientTransportPlugin line and look for the meek or
    // meek_lite transport. This code works a lot like the Tor daemon's
    // parse_transport_line() function.
    let tokens = aLine.split(' ');
    if ((tokens.length > 2) && (tokens[1] == "exec"))
    {
      let transportArray = tokens[0].split(",").map(aStr => aStr.trim());
      let transport = transportArray.find(
                                  aTransport => (aTransport === "meek"));
      if (!transport)
      {
        transport = transportArray.find(
                                  aTransport => (aTransport === "meek_lite"));
      }
      if (transport)
      {
        meekTransport = transport;
        meekClientPath = tokens[2];
        meekClientArgs = tokens.slice(3);
      }
    }
  });

  if (!meekTransport)
  {
    reportMoatError(TorLauncherUtil.getLocalizedString("no_meek"));
    return;
  }

  let proxySettings;
  if (isProxyConfigured())
  {
    proxySettings = getAndValidateProxySettings(true);
    if (!proxySettings)
      return;
  }

  let overlay = document.getElementById(kBridgeDBRequestOverlay);
  if (overlay)
  {
    let cancelBtn = document.getElementById(kBridgeDBCancelButton);
    if (cancelBtn)
      cancelBtn.setAttribute("label", gCancelLabelStr);

    showOrHideDialogButtons(false);
    resetBridgeDBRequestPrompt();
    setBridgeDBRequestState("fetchingCaptcha");
    overlay.hidden = false;
    requestMoatCaptcha(proxySettings, meekTransport, meekClientPath,
                       meekClientArgs);
  }
}


// When aState is anything other than undefined, a network request is
// in progress.
function setBridgeDBRequestState(aState)
{
  let overlay = document.getElementById(kBridgeDBRequestOverlay);
  if (overlay)
  {
    if (aState)
      overlay.setAttribute("state", aState);
    else
      overlay.removeAttribute("state");
  }

  let key = (aState) ? "contacting_bridgedb" : "captcha_prompt";
  setElemValue(kBridgeDBPrompt, TorLauncherUtil.getLocalizedString(key));

  let textBox = document.getElementById(kBridgeDBCaptchaSolution);
  if (textBox)
  {
    if (aState)
      textBox.setAttribute("disabled", "true");
    else
      textBox.removeAttribute("disabled");
  }

  // Show the network activity spinner or the reload button, as appropriate.
  let deckElem = document.getElementById("bridgeDBReloadDeck");
  if (deckElem)
  {
    let panelID = aState ? kBridgeDBNetworkActivity
                         : kBridgeDBReloadCaptchaButton;
    deckElem.selectedPanel = document.getElementById(panelID);
  }
}


function onDismissBridgeDBRequestPrompt()
{
  let overlay = document.getElementById(kBridgeDBRequestOverlay);
  if (overlay)
  {
    overlay.hidden = true;
    showOrHideDialogButtons(true);
  }

  setBridgeDBRequestState(undefined);
}


function onCancelBridgeDBRequestPrompt()
{
  // If an event listener is installed, the cancel of pending Moat requests
  // and other necessary cleanup is handled in a cancel event listener.
  if (gBridgeDBRequestEventListeners.length > 0)
    document.dispatchEvent(new CustomEvent(kCaptchaCancelEventType, {}));
  else
    onDismissBridgeDBRequestPrompt();
}


function resetBridgeDBRequestPrompt()
{
  let textBox = document.getElementById(kBridgeDBCaptchaSolution);
  if (textBox)
    textBox.value = "";

  let image = document.getElementById(kBridgeDBCaptchaImage);
  if (image)
  {
    image.removeAttribute("src");
    image.style.transition = "";
    image.style.height = "0px";
  }

  onCaptchaSolutionChange();
}


function onCaptchaSolutionChange()
{
  let val = getElemValue(kBridgeDBCaptchaSolution, undefined);
  enableButton(kBridgeDBSubmitButton, val && (val.length > 0));
  setElemValue(kBridgeDBCaptchaError, undefined); // clear error
}


function onReloadCaptcha()
{
  document.dispatchEvent(new CustomEvent(kCaptchaReloadEventType, {}));
}


function onCaptchaSolutionSubmit()
{
  let val = getElemValue(kBridgeDBCaptchaSolution, undefined);
  if (val)
    document.dispatchEvent(new CustomEvent(kCaptchaSubmitEventType, {}));
}


function isShowingBridgeDBRequestPrompt()
{
  let overlay = document.getElementById(kBridgeDBRequestOverlay);
  return overlay && !overlay.hasAttribute("hidden");
}


function showBridgeDBBridges()
{
  // Truncate the bridge info for display.
  const kMaxLen = 65;
  let val;
  if (gBridgeDBBridges)
  {
    gBridgeDBBridges.forEach(aBridgeLine =>
      {
        let line;
        if (aBridgeLine.length <= kMaxLen)
          line = aBridgeLine;
        else
          line = aBridgeLine.substring(0, kMaxLen) + "\u2026"; // ellipsis;
        if (val)
          val += "\n" + line;
        else
          val = line;
      });
  }

  setElemValue(kBridgeDBResult, val);

  // Update the "Get a Bridge" button label.
  let btn = document.getElementById(kBridgeDBRequestButton);
  if (btn)
  {
    let btnLabelKey = val ? "request_a_new_bridge"
                          : "request_a_bridge";
    btn.label = TorLauncherUtil.getLocalizedString(btnLabelKey);
  }
}


function onDeckSelect()
{
  let deckElem = document.getElementById("deck");
  if (kNetworkSettingsProgressPanelID == deckElem.id)
    onShowProgressPanel();
}


function onShowProgressPanel()
{
  if (gTorProcessService.TorIsBootstrapDone)
  {
    close();
    return;
  }

  // Set up navigation buttons.
  // setTimeout() is needed because this panel may be shown first.
  // Because resetProgressNavButtons() is called without delay, it may
  // be called before this timer fires. Therefore we store a reference
  // to it so that we can cancel it inside resetProgressNavButtons().
  gShowProgressTimer = setTimeout(function() {
      gShowProgressTimer = undefined;
      showOrHideButton("cancel", false, false); // hide quit button
      overrideButtonLabel("finish", gCancelLabelStr);
  }, 0);
}


// resetProgressNavButtons() is called when moving away from the progress
// panel entirely, and when an error is displayed within the progress panel.
function resetProgressNavButtons()
{
  if (gShowProgressTimer)
  {
    clearTimeout(gShowProgressTimer);
    gShowProgressTimer = undefined;
  }

  restoreButtonLabel("finish");
  showOrHideButton("cancel", true, false);
}


var gObserver = {
  observe: function(aSubject, aTopic, aData)
  {
    if ((kTorBootstrapErrorTopic == aTopic) ||
         (kTorLogHasWarnOrErrTopic == aTopic))
    {
      showCopyLogButton(true);
      if (kTorBootstrapErrorTopic == aTopic)
      {
        stopTorBootstrap();
        showErrorMessage(aSubject.wrappedJSObject, true);
      }
      return;
    }

    if (kTorProcessReadyTopic == aTopic)
    {
      removeObserver(kTorProcessReadyTopic);
      removeObserver(kTorProcessDidNotStartTopic);
      onTorStarted();
    }
    else if (kTorProcessDidNotStartTopic == aTopic)
    {
      removeObserver(kTorProcessReadyTopic);
      removeObserver(kTorProcessDidNotStartTopic);
      showErrorMessage(aSubject.wrappedJSObject, false);
    }
    else if (kTorProcessExitedTopic == aTopic)
    {
      removeObserver(kTorProcessExitedTopic);
      showRestartPanel();
    }
    else if (kTorShowProgressPanelTopic == aTopic)
    {
      showProgressPanel();
    }
    else if (kTorBootstrapStatusTopic == aTopic)
    {
      updateBootstrapProgress(aSubject.wrappedJSObject);
    }
  }
};


// addObserver() will not add two observers for the same topic.
function addObserver(aTopic)
{
  if (gActiveTopics.indexOf(aTopic) < 0)
  {
    gObsService.addObserver(gObserver, aTopic, false);
    gActiveTopics.push(aTopic);
  }
}


function removeObserver(aTopic)
{
  let idx = gActiveTopics.indexOf(aTopic);
  if (idx >= 0)
  {
    gObsService.removeObserver(gObserver, aTopic);
    gActiveTopics.splice(idx, 1);
  }
}


function removeAllObservers()
{
  for (let i = gActiveTopics.length - 1; i >= 0; --i)
    gObsService.removeObserver(gObserver, gActiveTopics[i]);

  gActiveTopics = [];
}


function updateBootstrapProgress(aStatusObj)
{
  if (!isShowingProgress())
    return;

  // Ignore status updates if the Reconfigure button is showing because this
  // means that we are currently displaying an error message, and we do not
  // want the error to be replaced by a generic progress message.
  let progressContent = document.getElementById("progressContent");
  if (progressContent && progressContent.hasAttribute("isShowingReconfigure"))
    return;

  let labelText =
            TorLauncherUtil.getLocalizedBootstrapStatus(aStatusObj, "TAG");
  let percentComplete = (aStatusObj.PROGRESS) ? aStatusObj.PROGRESS : 0;

  let meter = document.getElementById("progressMeter");
  if (meter)
  {
    meter.setAttribute("value", percentComplete);
    showProgressMeterIfNoError();
  }

  if (percentComplete >= 100)
  {
    // To ensure that 100% progress is displayed, wait a short while before
    // closing this window... but first, hide the cancel button to avoid a
    // race where the user clicks Cancel when bootstrapping has already
    // finished (and this window is scheduled to close in 250ms). Use CSS
    // visibility=hidden instead of XUL hidden=true so that the "For
    // Assistance" text does not move.
    let btnID = getWizard() ? "finish" : "cancel";
    let btn = getButton(btnID);
    if (btn)
      btn.style.visibility = "hidden";
    window.setTimeout(function() { close(); }, 250);
    gIsWindowScheduledToClose = true;
  }

  let desc = document.getElementById("progressDesc");
  if (labelText && desc)
    desc.textContent = labelText;
}


function readTorSettings()
{
  TorLauncherLogger.log(2, "readTorSettings " +
                            "----------------------------------------------");

  let didSucceed = false;
  try
  {
    // TODO: retrieve > 1 key at one time inside initProxySettings() et al.
    didSucceed = initBridgeSettings() &&
                 initProxySettings() && initFirewallSettings();
  }
  catch (e) { TorLauncherLogger.safelog(4, "Error in readTorSettings: ", e); }

  if (!didSucceed)
  {
    // Unable to communicate with tor.  Hide settings and display an error.
    let details = TorLauncherUtil.getLocalizedString("ensure_tor_is_running");
    let s = TorLauncherUtil.getFormattedLocalizedString(
                                "failed_to_get_settings", [details], 1);
    let errorObj = { message: s };
    showErrorMessage(errorObj, false);
  }

  TorLauncherLogger.log(2, "readTorSettings done; didSucceed: " + didSucceed);
  return didSucceed;
}


function onTorStarted()
{
  if (readTorSettings())
  {
    showPanel();
    if (gInitialPanelID)
      advanceToWizardPanel(gInitialPanelID);
  }
}


// If aPanelID is undefined, the first panel is displayed.
function showPanel(aPanelID)
{
  var wizard = getWizard();
  if (!aPanelID)
    aPanelID = (wizard) ? kWizardFirstPageID : "settings";

  var deckElem = document.getElementById("deck");
  if (deckElem)
  {
    deckElem.selectedPanel = document.getElementById(aPanelID);
  }
  else if (wizard.currentPage.pageid != aPanelID)
  {
    if (kWizardProgressPageID == wizard.currentPage.pageid)
      resetProgressNavButtons(); // goTo() does not generate pagehide events.
    wizard.goTo(aPanelID);
  }

  if (!wizard)
  {
    // Ensure that the OK button is only shown on the main settings panel.
    showOrHideButton("accept", (aPanelID == "settings"), true);
  }
}


// This function assumes that you are starting on the first page.
function advanceToWizardPanel(aPanelID)
{
  var wizard = getWizard();
  if (!wizard)
    return;

  if (kWizardProgressPageID == aPanelID)
  {
    showProgressPanel();
    return;
  }

  onWizardConfigure(); // Equivalent to pressing "Configure"

  const kMaxTries = 10;
  for (var count = 0;
       ((count < kMaxTries) &&
        (wizard.currentPage.pageid != aPanelID) &&
        wizard.canAdvance);
       ++count)
  {
    wizard.advance();
  }
}


function showStartingTorPanel()
{
  showPanel("startingTor");
}


function showErrorMessage(aErrorObj, aShowReconfigButton)
{
  if (aErrorObj && aErrorObj.handled)
    return;

  // Determine our strategy for displaying this error message.
  const kShowErrorInErrorPanel = 1;
  const kShowErrorUsingErrorOverlay = 2;
  const kShowErrorInProgressPanel = 3;
  let errorStrategy = kShowErrorInErrorPanel;

  let wizard = getWizard();
  if (isShowingProgress() && aShowReconfigButton)
    errorStrategy = kShowErrorInProgressPanel;
  else if (!wizard || (wizard.currentPage.pageid == "configureSettings"))
    errorStrategy = kShowErrorUsingErrorOverlay;

  let errorContainer;
  if (errorStrategy == kShowErrorUsingErrorOverlay)
    errorContainer = getErrorOverlay();
  else if (errorStrategy == kShowErrorInProgressPanel)
    errorContainer = document.getElementById("progressContent");
  else
    errorContainer = wizard.getPageById("errorPanel");
  if (!errorContainer)
    return;

  let messageElem = getFirstElementByErrorOverlayID(errorContainer, "message");
  if (messageElem)
  {
    let msg = "";
    if (aErrorObj && aErrorObj.message)
    {
      msg = aErrorObj.message;
      if (aErrorObj.details)
        msg += "\n\n" + aErrorObj.details;
      aErrorObj.handled = true;
    }
    messageElem.textContent = msg;
  }

  if (errorStrategy == kShowErrorUsingErrorOverlay)
  {
    showOrHideDialogButtons(false);

    let dismissBtn = getFirstElementByErrorOverlayID(errorContainer,
                                                     "dismissButton");
    let bundle = Cc["@mozilla.org/intl/stringbundle;1"]
             .getService(Ci.nsIStringBundleService)
             .createBundle("chrome://global/locale/commonDialogs.properties");
    dismissBtn.label = bundle.GetStringFromName("OK");
    errorContainer.removeAttribute("hidden");
    if (dismissBtn)
      dismissBtn.focus();
  }
  else if (errorStrategy == kShowErrorInProgressPanel)
  {
    // In this case, we always show a "Reconfigure" button.
    errorContainer.setAttribute("isShowingReconfigure", "true");
    let btnLabel = document.getElementById("progressReconfigureLabel");
    if (wizard)
    {
      showOrHideElemById("progressPleaseWait", false);
      resetProgressNavButtons();  // Show Quit and clear "show progress" timer.
      overrideButtonLabel("finish", btnLabel.value);
    }
    else if (btnLabel)
    {
      // Network Settings window (non-wizard) case.
      overrideButtonLabel("cancel", btnLabel.value);
    }
  }
  else // if (errorStrategy == kShowErrorInErrorPanel)
  {
    let reconfigBtn = getFirstElementByErrorOverlayID(errorContainer,
                                                      "reconfigButton");
    if (reconfigBtn)
    {
      if (aShowReconfigButton)
        reconfigBtn.removeAttribute("hidden");
      else
        reconfigBtn.setAttribute("hidden", true);
    }

    // Navigate to the wizard error panel.
    showPanel("errorPanel");
  }

  let haveErrorOrWarning = (gTorProcessService.TorBootstrapErrorOccurred ||
                            gProtocolSvc.TorLogHasWarnOrErr)
  showCopyLogButton(haveErrorOrWarning);
}


function getErrorOverlay()
{
  return document.getElementById(getWizard() ? "configErrorOverlay"
                                             : "errorOverlay");
}


function getFirstElementByErrorOverlayID(aContainer, aID)
{
  let nodeList = aContainer.getElementsByAttribute("errorElemId", aID);
  return (nodeList && (nodeList.length > 0)) ? nodeList[0] : undefined;
}


function showRestartPanel()
{
  let elem = document.getElementById("restartPanelMessage");
  if (elem)
  {
    elem.textContent = TorLauncherUtil.getLocalizedString("tor_exited")
                + "\n\n" + TorLauncherUtil.getLocalizedString("tor_exited2");
  }

  showPanel("restartPanel");

  let haveErrorOrWarning = (gTorProcessService.TorBootstrapErrorOccurred ||
                            gProtocolSvc.TorLogHasWarnOrErr)
  showCopyLogButton(haveErrorOrWarning);
}


function onDismissErrorOverlay()
{
  let errorOverlay = getErrorOverlay();
  if (errorOverlay)
    errorOverlay.setAttribute("hidden", true);

  showOrHideDialogButtons(true);
}


function isShowingErrorOverlay()
{
  let errorOverlay = getErrorOverlay();
  return errorOverlay && !errorOverlay.hasAttribute("hidden");
}


function showCopyLogButton(aHaveErrorOrWarning)
{
  let copyLogBtn = getButton("extra2");
  if (copyLogBtn)
  {
    let haveWizard = (getWizard() != null);
    if (haveWizard)
      copyLogBtn.setAttribute("wizardCanCopyLog", true);

    if (!gRestoreAfterHelpPanelID)
      copyLogBtn.removeAttribute("hidden"); // Show button if help is not open.

    if (aHaveErrorOrWarning)
    {
      let clz = copyLogBtn.getAttribute("class");
      if (!clz)
        copyLogBtn.setAttribute("class", "torWarning");
      else if (clz.indexOf("torWarning") < 0)
        copyLogBtn.setAttribute("class", clz + " torWarning");
    }
  }
}


function restoreCopyLogVisibility()
{
  let copyLogBtn = getButton("extra2");
  if (!copyLogBtn)
    return;

  // Always show button in non-wizard case; conditionally in wizard.
  if (!getWizard() || copyLogBtn.hasAttribute("wizardCanCopyLog"))
    copyLogBtn.removeAttribute("hidden");
  else
    copyLogBtn.setAttribute("hidden", true);
}


// Show or hide all of the buttons that are in the "footer" of the wizard or
// Network Settings window.
function showOrHideDialogButtons(aShow)
{
  let wizard = getWizard();
  let buttonContainer = wizard
                          ? wizard.shadowRoot.querySelector(".wizard-buttons")
                          : document.querySelector(".dialog-button-box");

  if (buttonContainer)
  {
    if (aShow)
      buttonContainer.removeAttribute("hidden");
    else
      buttonContainer.hidden = true;
  }
}


function showOrHideButton(aID, aShow, aFocus)
{
  var btn = setButtonAttr(aID, "hidden", !aShow);
  if (btn && aFocus)
    btn.focus()
}


// Returns the button element (if found).
function enableButton(aID, aEnable)
{
  return setButtonAttr(aID, "disabled", !aEnable);
}


// Returns the button element (if found).
function setButtonAttr(aID, aAttr, aValue)
{
  if (!aID || !aAttr)
    return null;

  let btn = getButton(aID);  // dialog buttons
  if (!btn)
    btn = document.getElementById(aID);               // other buttons
  if (btn)
  {
    if (aValue)
      btn.setAttribute(aAttr, aValue);
    else
      btn.removeAttribute(aAttr);
  }

  return btn;
}


function showOrHideElemById(aID, aShow)
{
  let elem = document.getElementById(aID);
  if (elem)
  {
    if (aShow)
      elem.removeAttribute("hidden");
    else
      elem.setAttribute("hidden", true);
  }
}


// Sets or removes aAttr for aID as well as optional aID+"Label" element.
function setBoolAttrForElemWithLabel(aID, aAttr, aValue)
{
  if (!aID)
    return;

  var elem = document.getElementById(aID);
  if (elem)
  {
    var label = document.getElementById(aID + "Label");
    if (aValue)
    {
      if (label)
        label.setAttribute(aAttr, true);

      elem.setAttribute(aAttr, true);
    }
    else
    {
      if (label)
        label.removeAttribute(aAttr);

      elem.removeAttribute(aAttr);
    }
  }
}


// Enables / disables aID as well as optional aID+"Label" element.
function enableElemWithLabel(aID, aEnable)
{
  setBoolAttrForElemWithLabel(aID, "disabled", !aEnable);
}


// Removes placeholder text when disabled.
function enableTextBox(aID, aEnable)
{
  enableElemWithLabel(aID, aEnable);
  var textbox = document.getElementById(aID);
  if (textbox)
  {
    if (aEnable)
    {
      var s = textbox.getAttribute("origPlaceholder");
      if (s)
        textbox.setAttribute("placeholder", s);
    }
    else
    {
      textbox.setAttribute("origPlaceholder", textbox.placeholder);
      textbox.removeAttribute("placeholder");
    }
  }
}


function showMenuListPlaceholderText(aElemID)
{
  let menu = document.getElementById(aElemID);
  if (menu)
  {
    menu.selectedItem = undefined;
    let placeholder = menu.getAttribute("placeholder");
    if (placeholder)
      menu.setAttribute("label", placeholder);
  }
}


function overrideButtonLabel(aID, aLabel)
{
  let btn = getButton(aID);
  if (btn)
  {
    btn.setAttribute("origLabel", btn.label);
    btn.label = aLabel;
  }
}


function overrideButtonLabelWithKey(aID, aLabelKey)
{
  let label = TorLauncherUtil.getLocalizedString(aLabelKey);
  overrideButtonLabel(aID, label);
}


function restoreButtonLabel(aID)
{
  var btn = getButton(aID);
  if (btn)
  {
    var oldLabel = btn.getAttribute("origLabel");
    if (oldLabel)
    {
      btn.label = oldLabel;
      btn.removeAttribute("origLabel");
    }
  }
}


function onLocaleListDoubleClick()
{
  getWizard().advance();
}


function setLocale()
{
  let locale = getElemValue(kLocaleList, "en-US");
  if (TorLauncherUtil.isMac && ("ja" == locale))
    locale = "ja-JP-mac";
  TorLauncherUtil.setCharPref(kPrefLocale, locale);
  TorLauncherUtil.setBoolPref(kPrefPromptForLocale, false);
  TorLauncherUtil.setBoolPref(kPrefMatchOSLocale, false);

  // Clear cached strings so the new locale takes effect.
  TorLauncherUtil.flushLocalizedStringCache();
  gObsService.notifyObservers(null, "chrome-flush-caches", null);
}


function onProxyTypeChange()
{
  var proxyType = getElemValue(kProxyTypeMenulist, null);
  var mayHaveCredentials = (proxyType != "SOCKS4");
  enableTextBox(kProxyUsername, mayHaveCredentials);
  enableTextBox(kProxyPassword, mayHaveCredentials);
}


// Called when user clicks "Restart Tor" button after tor unexpectedly quits.
function onRestartTor()
{
  // Re-add these observers in case they have been removed.
  addObserver(kTorProcessReadyTopic);
  addObserver(kTorProcessDidNotStartTopic);
  addObserver(kTorProcessExitedTopic);

  // Start tor with networking disabled so that the user has a chance to
  // make configuration changes before bootstrapping begins.
  gIsPostRestartBootstrapNeeded = true;
  showStartingTorPanel();
  gTorProcessService.TorStartAndControlTor(true);
}


function onWizardReconfig()
{
  showPanel(kWizardFirstPageID);
  onWizardConfigure();
}


function onCancel()
{
  if (gIsWindowScheduledToClose)
    return false;     // Ignore cancel in this case.

  if (gRestoreAfterHelpPanelID) // Is help open?
  {
    closeHelp();
    return false;
  }

  if (isShowingErrorOverlay())
  {
    onDismissErrorOverlay();
    return false;
  }

  if (isShowingBridgeDBRequestPrompt())
  {
    onCancelBridgeDBRequestPrompt();
    return false;
  }

  let wizard = getWizard();
  if (!wizard && isShowingProgress())
  {
    onProgressCancelOrReconfigure(undefined);
    return false;
  }

  // If this is a wizard (initial config or locale picker), the cancel
  // button is "Quit"
  if (wizard)
  {
    try
    {
      gObsService.notifyObservers(null, "TorUserRequestedQuit", null);
    } catch (e) {}
  }
  else if (gIsPostRestartBootstrapNeeded)
  {
    useSettings();
    return false;
  }

  return true;
}


function onWizardFinish()
{
  if (isShowingErrorOverlay())
  {
    onDismissErrorOverlay();
    return false;
  }

  if (isShowingBridgeDBRequestPrompt())
  {
    onCaptchaSolutionSubmit();
    return false;
  }

  if (isShowingProgress())
  {
    onProgressCancelOrReconfigure(getWizard());
    return false;
  }

  return applySettings(false);
}


function onNetworkSettingsFinish()
{
  if (gRestoreAfterHelpPanelID) // Is help open?
  {
    closeHelp();
    return false;
  }

  if (isShowingErrorOverlay())
  {
    onDismissErrorOverlay();
    return false;
  }

  if (isShowingBridgeDBRequestPrompt())
  {
    onCaptchaSolutionSubmit();
    return false;
  }

  return applySettings(false);
}


// When the progress panel is open, cancel stops bootstrapping... unless
// we are showing an error, in which case the action is "Reconfigure".
function onProgressCancelOrReconfigure(aWizard)
{
  let progressContent = document.getElementById("progressContent");
  if (!progressContent ||
      !progressContent.hasAttribute("isShowingReconfigure"))
  {
    stopTorBootstrap();
  }

  if (aWizard)
  {
    aWizard.rewind();
  }
  else
  {
    restoreButtonLabel("cancel");
    showPanel(undefined); // return to the Network Settings main panel.
  }
}


function onCopyLog()
{
  // Copy tor log messages to the system clipboard.
  var chSvc = Cc["@mozilla.org/widget/clipboardhelper;1"]
                             .getService(Ci.nsIClipboardHelper);
  let countObj = { value: 0 };
  chSvc.copyString(gProtocolSvc.TorGetLog(countObj));

  // Display a feedback popup that fades away after a few seconds.
  let copyLogBtn = getButton("extra2");
  let panel = document.getElementById(kCopyLogFeedbackPanel);
  if (copyLogBtn && panel)
  {
    panel.firstChild.textContent = TorLauncherUtil.getFormattedLocalizedString(
                                     "copiedNLogMessages", [countObj.value], 1);
    panel.openPopup(copyLogBtn, "before_start", 0, 0, false, false);
  }
}


function closeCopyLogFeedbackPanel()
{
  let panel = document.getElementById(kCopyLogFeedbackPanel);
  if (panel && (panel.state =="open"))
    panel.hidePopup();
}


function onOpenHelp(aHelpContentID)
{
  if (gRestoreAfterHelpPanelID) // Already open?
    return;

  let deckElem = document.getElementById("deck");
  if (deckElem)
    gRestoreAfterHelpPanelID = deckElem.selectedPanel.id;
  else
    gRestoreAfterHelpPanelID = getWizard().currentPage.pageid;

  let contentElem = document.getElementById(aHelpContentID);
  if (contentElem)
    contentElem.removeAttribute("hidden");

  showPanel("helpPanel");

  showOrHideButton("extra2", false, false); // Hide "Copy Tor Log To Clipboard"

  if (getWizard())
  {
    showOrHideButton("cancel", false, false);
    overrideButtonLabelWithKey("next", "done");
    showOrHideElemById("forAssistance", false);
  }
  else
  {
    overrideButtonLabelWithKey("cancel", "done");
  }
}


function closeHelp()
{
  if (!gRestoreAfterHelpPanelID)  // Already closed?
    return;

  restoreCopyLogVisibility();

  let helpPanel;
  let wizardElem = getWizard();
  if (wizardElem)
  {
    showOrHideButton("cancel", true, false);
    restoreButtonLabel("next");
    showOrHideElemById("forAssistance", true);
    helpPanel = wizardElem.currentPage;
  }
  else
  {
    restoreButtonLabel("cancel");
    helpPanel = document.getElementById("helpPanel");
  }

  showPanel(gRestoreAfterHelpPanelID);
  gRestoreAfterHelpPanelID = null;

  for (let childElem = helpPanel.firstChild; childElem;
       childElem = childElem.nextSibling)
  {
    childElem.setAttribute("hidden", true);
  }
}


// Returns true if successful.
function initProxySettings()
{
  let proxyType, proxyAddrPort, proxyUsername, proxyPassword;
  let reply = gProtocolSvc.TorGetConfStr(kTorConfKeySocks4Proxy, null);
  if (!gProtocolSvc.TorCommandSucceeded(reply))
    return false;

  if (reply.retVal)
  {
    proxyType = "SOCKS4";
    proxyAddrPort = reply.retVal;
  }
  else
  {
    reply = gProtocolSvc.TorGetConfStr(kTorConfKeySocks5Proxy, null);
    if (!gProtocolSvc.TorCommandSucceeded(reply))
      return false;

    if (reply.retVal)
    {
      proxyType = "SOCKS5";
      proxyAddrPort = reply.retVal;
      reply = gProtocolSvc.TorGetConfStr(kTorConfKeySocks5ProxyUsername, null);
      if (!gProtocolSvc.TorCommandSucceeded(reply))
        return false;

      proxyUsername = reply.retVal;
      reply = gProtocolSvc.TorGetConfStr(kTorConfKeySocks5ProxyPassword, null);
      if (!gProtocolSvc.TorCommandSucceeded(reply))
        return false;

      proxyPassword = reply.retVal;
    }
    else
    {
      reply = gProtocolSvc.TorGetConfStr(kTorConfKeyHTTPSProxy, null);
      if (!gProtocolSvc.TorCommandSucceeded(reply))
        return false;

      if (reply.retVal)
      {
        proxyType = "HTTP";
        proxyAddrPort = reply.retVal;
        reply = gProtocolSvc.TorGetConfStr(
                                   kTorConfKeyHTTPSProxyAuthenticator, null);
        if (!gProtocolSvc.TorCommandSucceeded(reply))
          return false;

        let values = parseColonStr(reply.retVal);
        proxyUsername = values[0];
        proxyPassword = values[1];
      }
    }
  }

  let haveProxy = (proxyType != undefined);
  setElemValue(kUseProxyCheckbox, haveProxy);
  setElemValue(kProxyTypeMenulist, proxyType);
  if (!proxyType)
    showMenuListPlaceholderText(kProxyTypeMenulist);

  onProxyTypeChange();

  let proxyAddr, proxyPort;
  if (proxyAddrPort)
  {
    let values = parseColonStr(proxyAddrPort);
    proxyAddr = values[0];
    proxyPort = values[1];
  }

  setElemValue(kProxyAddr, proxyAddr);
  setElemValue(kProxyPort, proxyPort);
  setElemValue(kProxyUsername, proxyUsername);
  setElemValue(kProxyPassword, proxyPassword);

  return true;
} // initProxySettings


// Returns true if successful.
function initFirewallSettings()
{
  if (getWizard())
    return true;  // The wizard does not directly expose firewall settings.

  var allowedPorts;
  var reply = gProtocolSvc.TorGetConfStr(kTorConfKeyReachableAddresses, null);
  if (!gProtocolSvc.TorCommandSucceeded(reply))
    return false;

  if (reply.retVal)
  {
    var portStrArray = reply.retVal.split(',');
    for (var i = 0; i < portStrArray.length; i++)
    {
      var values = parseColonStr(portStrArray[i]);
      if (values[1])
      {
        if (allowedPorts)
          allowedPorts += ',' + values[1];
        else
          allowedPorts = values[1];
      }
    }
  }

  var haveFirewall = (allowedPorts != undefined);
  setElemValue(kUseFirewallPortsCheckbox, haveFirewall);
  if (allowedPorts)
    setElemValue(kFirewallAllowedPorts, allowedPorts);

  return true;
}


// Returns true if successful.
function initBridgeSettings()
{
  let typeList = TorLauncherUtil.defaultBridgeTypes;
  let canUseDefaultBridges = (typeList && (typeList.length > 0));
  let defaultType = TorLauncherUtil.getCharPref(kPrefDefaultBridgeType);
  let useDefault = canUseDefaultBridges && !!defaultType;
  let isMoatConfigured = TorLauncherBridgeDB.isMoatConfigured;

  showOrHideElemById("bridgeDBSettings", isMoatConfigured);

  // If not configured to use a default set of bridges, get UseBridges setting
  // from tor.
  let useBridges = useDefault;
  if (!useDefault)
  {
    showMenuListPlaceholderText(kDefaultBridgeTypeMenuList);

    let reply = gProtocolSvc.TorGetConfBool(kTorConfKeyUseBridges, false);
    if (!gProtocolSvc.TorCommandSucceeded(reply))
      return false;

    useBridges = reply.retVal;

    // Get the list of configured bridges from tor.
    let bridgeReply = gProtocolSvc.TorGetConf(kTorConfKeyBridgeList);
    if (!gProtocolSvc.TorCommandSucceeded(bridgeReply))
      return false;

    let configuredBridges = [];
    if (bridgeReply.lineArray)
    {
      bridgeReply.lineArray.forEach(aLine =>
        {
          let val = aLine.trim();
          if (val.length > 0)
            configuredBridges.push(val);
        });
    }

    gBridgeDBBridges = undefined;

    let prefBranch = TorLauncherUtil.getPrefBranch(kPrefBranchBridgeDBBridge);
    if (isMoatConfigured)
    {
      // Determine if we are using a set of bridges that was obtained via Moat.
      // This is done by checking each of the configured bridge lines against
      // the values stored under the extensions.torlauncher.bridgedb_bridge.
      // pref branch. The algorithm used here assumes there are no duplicate
      // values.
      let childPrefs = prefBranch.getChildList("", []);

      let bridgeCount = configuredBridges.length;
      if ((bridgeCount > 0) && (bridgeCount == childPrefs.length))
      {
        let foundCount = 0;
        childPrefs.forEach(aChild =>
          {
            if (configuredBridges.indexOf(prefBranch.getCharPref(aChild)) >= 0)
              ++foundCount;
          });

        if (foundCount == bridgeCount)
          gBridgeDBBridges = configuredBridges;
      }
    }

    if (!gBridgeDBBridges)
    {
      // The stored bridges do not match what is now in torrc. Clear
      // the stored info and treat the configured bridges as a set of
      // custom bridges.
      prefBranch.deleteBranch("");
      if (!setBridgeListElemValue(configuredBridges))
      {
        if (canUseDefaultBridges)
          useDefault = true;  // We have no custom values... back to default.
        else
          useBridges = false; // No custom or default bridges are available.
      }
    }
  }

  setElemValue(kUseBridgesCheckbox, useBridges);
  showBridgeDBBridges();

  showOrHideElemById("bridgeTypeRadioGroup", canUseDefaultBridges);

  let radioID = (useDefault) ? kDefaultBridgesRadio
           : (gBridgeDBBridges) ? kBridgeDBBridgesRadio : kCustomBridgesRadio;
  let radio = document.getElementById(radioID);
  if (radio)
    radio.control.selectedItem = radio;
  onBridgeTypeRadioChange();

  return true;
}


// Returns true if settings were successfully applied.
function applySettings(aUseDefaults)
{
  TorLauncherLogger.log(2, "applySettings ---------------------" +
                             "----------------------------------------------");
  var didSucceed = false;
  try
  {
    didSucceed = applyBridgeSettings(aUseDefaults) &&
                 applyProxySettings(aUseDefaults) &&
                 applyFirewallSettings(aUseDefaults);
  }
  catch (e) { TorLauncherLogger.safelog(4, "Error in applySettings: ", e); }

  if (didSucceed)
    useSettings();

  TorLauncherLogger.log(2, "applySettings done");

  return false;
}


function useSettings()
{
  var settings = {};
  settings[kTorConfKeyDisableNetwork] = false;
  let didApply = setConfAndReportErrors(settings, null);
  if (!didApply)
    return;

  // Record the new BridgeDB bridge values in preferences so later we
  // can detect that the bridges were received from BridgeDB via Moat.
  TorLauncherUtil.getPrefBranch(kPrefBranchBridgeDBBridge).deleteBranch("");
  if (isUsingBridgeDBBridges())
  {
    for (let i = 0; i < gBridgeDBBridges.length; ++i)
    {
      TorLauncherUtil.setCharPref(kPrefBranchBridgeDBBridge + i,
                                  gBridgeDBBridges[i].trim());
    }
  }

  gIsPostRestartBootstrapNeeded = false;

  gProtocolSvc.TorSendCommand("SAVECONF");
  gTorProcessService.TorClearBootstrapError();

  // If bootstrapping has finished or we are not responsible for starting
  // tor, close this window and return (no need to show the progress bar).
  if (gTorProcessService.TorIsBootstrapDone ||
      !TorLauncherUtil.shouldStartAndOwnTor)
  {
    close();
    return;
  }

  showProgressPanel();
}


function stopTorBootstrap()
{
  // Tell tor to disable use of the network; this should stop the bootstrap
  // process.
  const kErrorPrefix = "Setting DisableNetwork=1 failed: ";
  try
  {
    let settings = {};
    settings["DisableNetwork"] = true;
    let errObj = {};
    if (!gProtocolSvc.TorSetConfWithReply(settings, errObj))
      TorLauncherLogger.log(5, kErrorPrefix + errObj.details);
  }
  catch(e)
  {
    TorLauncherLogger.log(5, kErrorPrefix + e);
  }
}


function showProgressPanel()
{
  let progressContent = document.getElementById("progressContent");
  if (progressContent)
    progressContent.removeAttribute("isShowingReconfigure");

  if (gIsInitialBootstrap)
    showOrHideElemById("progressPleaseWait", true);

  // Clear the description to avoid displaying any old messages.
  let desc = document.getElementById("progressDesc");
  if (desc)
    desc.textContent = "";

  // To avoid showing an incorrect progress value, we hide the progress bar
  // until the first TorBootstrapStatus notification is received.
  let meter = document.getElementById("progressMeter");
  if (meter)
  {
    meter.setAttribute("value", 0);
    meter.style.visibility = "hidden";
  }

  // Show the correct wizard page or Network Settings panel.
  let wizardElem = getWizard();
  if (wizardElem)
  {
    if (kWizardDiscardSettingsPageID == wizardElem.currentPage.pageid)
      showPanel();  // Remove discard settings page from the flow.

    wizardElem.advance(kWizardProgressPageID);
  }
  else
  {
    showPanel(kNetworkSettingsProgressPanelID);
  }

  // Request the most recent bootstrap status info so that a
  // TorBootstrapStatus notification is generated as soon as possible.
  gProtocolSvc.TorRetrieveBootstrapStatus();

  // Also start a fail-safe timer to ensure that the progress bar is displayed
  // within 2 seconds in all cases.
  window.setTimeout(function() { showProgressMeterIfNoError(); }, 2000);
}


function showProgressMeterIfNoError()
{
  let meter = document.getElementById("progressMeter");
  if (meter && !gTorProcessService.TorBootstrapErrorOccurred)
    meter.style.visibility = "visible";
}


// Returns true if settings were successfully applied.
function applyProxySettings(aUseDefaults)
{
  let settings = aUseDefaults ? getDefaultProxySettings()
                              : getAndValidateProxySettings(false);
  if (!settings)
    return false;

  return setConfAndReportErrors(settings, "configureSettings");
}


function getDefaultProxySettings()
{
  let settings = {};
  settings[kTorConfKeySocks4Proxy] = null;
  settings[kTorConfKeySocks5Proxy] = null;
  settings[kTorConfKeySocks5ProxyUsername] = null;
  settings[kTorConfKeySocks5ProxyPassword] = null;
  settings[kTorConfKeyHTTPSProxy] = null;
  settings[kTorConfKeyHTTPSProxyAuthenticator] = null;
  return settings;
}


// Return a settings object if successful and null if not.
function getAndValidateProxySettings(aIsForMoat)
{
  var settings = getDefaultProxySettings();

  // TODO: validate user-entered data.  See Vidalia's NetworkPage::save()
  var proxyType, proxyAddrPort, proxyUsername, proxyPassword;
  if (isProxyConfigured())
  {
    proxyType = getElemValue(kProxyTypeMenulist, null);
    if (!proxyType)
    {
      let key = "error_proxy_type_missing";
      if (aIsForMoat)
        reportMoatError(TorLauncherUtil.getLocalizedString(key));
      else
        reportValidationError(key);
      return null;
    }

    proxyAddrPort = createColonStr(getElemValue(kProxyAddr, null),
                                   getElemValue(kProxyPort, null));
    if (!proxyAddrPort)
    {
      let key = "error_proxy_addr_missing";
      if (aIsForMoat)
        reportMoatError(TorLauncherUtil.getLocalizedString(key));
      else
        reportValidationError(key);
      return null;
    }

    if ("SOCKS4" != proxyType)
    {
      proxyUsername = getElemValue(kProxyUsername);
      proxyPassword = getElemValue(kProxyPassword);
    }
  }

  if ("SOCKS4" == proxyType)
  {
    settings[kTorConfKeySocks4Proxy] = proxyAddrPort;
  }
  else if ("SOCKS5" == proxyType)
  {
    settings[kTorConfKeySocks5Proxy] = proxyAddrPort;
    settings[kTorConfKeySocks5ProxyUsername] = proxyUsername;
    settings[kTorConfKeySocks5ProxyPassword] = proxyPassword;
  }
  else if ("HTTP" == proxyType)
  {
    settings[kTorConfKeyHTTPSProxy] = proxyAddrPort;
    // TODO: Does any escaping need to be done?
    settings[kTorConfKeyHTTPSProxyAuthenticator] =
                                  createColonStr(proxyUsername, proxyPassword);
  }

  return settings;
} // getAndValidateProxySettings


function isProxyConfigured()
{
  return getElemValue(kUseProxyCheckbox, false);
}


function reportValidationError(aStrKey)
{
  showSaveSettingsError(TorLauncherUtil.getLocalizedString(aStrKey));
}


// Returns true if settings were successfully applied.
function applyFirewallSettings(aUseDefaults)
{
  let settings;
  if (aUseDefaults)
    settings = getDefaultFirewallSettings();
  else if (getWizard())
    settings = getAutoFirewallSettings();
  else
    settings = getAndValidateFirewallSettings();

  if (!settings)
    return false;

  return setConfAndReportErrors(settings, null);
}


// Return a settings object if successful and null if not.
// Not used for the wizard.
function getAndValidateFirewallSettings()
{
  // TODO: validate user-entered data.  See Vidalia's NetworkPage::save()

  var settings = {};
  settings[kTorConfKeyReachableAddresses] = null;

  var allowedPorts = null;
  if (getElemValue(kUseFirewallPortsCheckbox, false))
    allowedPorts = getElemValue(kFirewallAllowedPorts, null);

  return constructFirewallSettings(allowedPorts);
}


function getDefaultFirewallSettings()
{
  return constructFirewallSettings(undefined);
}


// Return a settings object if successful and null if not.
// Only used for the wizard.
function getAutoFirewallSettings()
{
  // In the wizard, we automatically set firewall ports (ReachableAddresses) to
  // 80 and 443 if and only if the user has configured a proxy but no bridges.
  // Rationale (from ticket #11405):
  //   - Many proxies restrict which ports they will proxy for, so we want to
  //     use a small set of ports in that case.
  //
  //   - In most other situations, tor will quickly find a bridge or guard on
  //     port 443, so there is no need to limit which port may be used.
  //
  //   - People whose set of reachable ports are really esoteric will need to
  //     be very patient or they will need to edit torrc manually... but that
  //     is OK since we expect that situation to be very rare.
  var allowedPorts = null;
  if (isProxyConfigured() && !isBridgeConfigured())
    allowedPorts = "80,443";

  return constructFirewallSettings(allowedPorts);
}


function constructFirewallSettings(aAllowedPorts)
{
  var settings = {};
  settings[kTorConfKeyReachableAddresses] = null;

  if (aAllowedPorts)
  {
    var portsConfStr;
    var portsArray = aAllowedPorts.split(',');
    for (var i = 0; i < portsArray.length; ++i)
    {
      var s = portsArray[i].trim();
      if (s.length > 0)
      {
        if (!portsConfStr)
          portsConfStr = "*:" + s;
        else
          portsConfStr += ",*:" + s;
      }
    }

    if (portsConfStr)
      settings[kTorConfKeyReachableAddresses] = portsConfStr;
  }

  return settings;
}


function initDefaultBridgeTypeMenu()
{
  let menu = document.getElementById(kDefaultBridgeTypeMenuList);
  if (!menu)
    return;

  menu.removeAllItems();

  let typeArray = TorLauncherUtil.defaultBridgeTypes;
  if (!typeArray || typeArray.length == 0)
    return;

  // Move the recommended type to the top of the list.
  let recommendedType = TorLauncherUtil.getCharPref(
                                      kPrefDefaultBridgeRecommendedType, null);
  if (recommendedType)
  {
    for (let i = 0; i < typeArray.length; i++)
    {
      if (typeArray[i] == recommendedType)
      {
        typeArray.splice(i, 1);             // remove
        typeArray.unshift(recommendedType); // add to the beginning
        break;
      }
    }
  }

  // Build the popup menu.
  let selectedType = TorLauncherUtil.getCharPref(kPrefDefaultBridgeType, null);
  for (let i = 0; i < typeArray.length; i++)
  {
    let bridgeType = typeArray[i];
    let menuItemLabel = bridgeType;
    let key = "bridge_suffix." + bridgeType;
    let suffix = TorLauncherUtil.getLocalizedString(key);
    if (suffix != key)
      menuItemLabel += " " + suffix;

    let mi = menu.appendItem(menuItemLabel, bridgeType);
    if (bridgeType == selectedType)
      menu.selectedItem = mi;
  }
}


// Returns true if settings were successfully applied.
function applyBridgeSettings(aUseDefaults)
{
  let settings = (aUseDefaults) ? getDefaultBridgeSettings()
                                : getAndValidateBridgeSettings();
  if (!settings)
    return false;

  if (aUseDefaults)
    TorLauncherUtil.setCharPref(kPrefDefaultBridgeType, "");

  return setConfAndReportErrors(settings, "configureSettings");
}


function getDefaultBridgeSettings()
{
  let settings = {};
  settings[kTorConfKeyUseBridges] = null;
  settings[kTorConfKeyBridgeList] = null;
  return settings;
}


// Return a settings object if successful and null if not.
function getAndValidateBridgeSettings()
{
  let settings = getDefaultBridgeSettings();
  let useBridges = isBridgeConfigured();
  let defaultBridgeType;
  let bridgeList;
  if (useBridges)
  {
    if (getElemValue(kBridgeDBBridgesRadio, false))
    {
      if (gBridgeDBBridges)
      {
        bridgeList = gBridgeDBBridges;
      }
      else
      {
        reportValidationError("error_bridgedb_bridges_missing");
        return null;
      }
    }
    else if (getElemValue(kCustomBridgesRadio, false))
    {
      let bridgeStr = getElemValue(kBridgeList, null);
      bridgeList = parseAndValidateBridges(bridgeStr);
      if (!bridgeList)
      {
        reportValidationError("error_bridges_missing");
        return null;
      }

      setBridgeListElemValue(bridgeList);
    }
    else
    {
      defaultBridgeType = getElemValue(kDefaultBridgeTypeMenuList, null);
      if (!defaultBridgeType)
      {
        reportValidationError("error_default_bridges_type_missing");
        return null;
      }
    }
  }

  // Since it returns a filtered list of bridges,
  // TorLauncherUtil.defaultBridges must be called after setting the
  // kPrefDefaultBridgeType pref.
  TorLauncherUtil.setCharPref(kPrefDefaultBridgeType, defaultBridgeType);
  if (defaultBridgeType)
    bridgeList = TorLauncherUtil.defaultBridges;

  if (useBridges && bridgeList)
  {
    settings[kTorConfKeyUseBridges] = true;
    settings[kTorConfKeyBridgeList] = bridgeList;
  }

  return settings;
}


function isBridgeConfigured()
{
  return getElemValue(kUseBridgesCheckbox, false);
}


function isUsingBridgeDBBridges()
{
  return isBridgeConfigured() && getElemValue(kBridgeDBBridgesRadio, false) &&
         gBridgeDBBridges;
}


// Returns an array or null.
function parseAndValidateBridges(aStr)
{
  if (!aStr)
    return null;

  var resultStr = aStr;
  resultStr = resultStr.replace(/\r\n/g, "\n");  // Convert \r\n pairs into \n.
  resultStr = resultStr.replace(/\r/g, "\n");    // Convert \r into \n.
  resultStr = resultStr.replace(/\n\n/g, "\n");  // Condense blank lines.

  var resultArray = new Array;
  var tmpArray = resultStr.split('\n');
  for (var i = 0; i < tmpArray.length; i++)
  {
    let s = tmpArray[i].trim();       // Remove extraneous white space.
    s = s.replace(/^bridge\s+/i, ""); // Remove "bridge " from start of line.
    resultArray.push(s);
  }

  return (0 == resultArray.length) ? null : resultArray;
}


// Returns true if successful.
// aShowOnErrorPanelID is only used when displaying the wizard.
function setConfAndReportErrors(aSettingsObj, aShowOnErrorPanelID)
{
  var errObj = {};
  var didSucceed = gProtocolSvc.TorSetConfWithReply(aSettingsObj, errObj);
  if (!didSucceed)
  {
    if (aShowOnErrorPanelID)
    {
      var wizardElem = getWizard();
      if (wizardElem) try
      {
        const kMaxTries = 10;
        for (var count = 0;
             ((count < kMaxTries) &&
              (wizardElem.currentPage.pageid != aShowOnErrorPanelID) &&
              wizardElem.canRewind);
             ++count)
        {
          wizardElem.rewind();
        }
      } catch (e) {}
    }

    showSaveSettingsError(errObj.details);
  }

  return didSucceed;
}


function showSaveSettingsError(aDetails)
{
  let msg = TorLauncherUtil.getSaveSettingsErrorMessage(aDetails);
  showErrorMessage({ message: msg }, true);
}


function setElemValue(aID, aValue)
{
  var elem = document.getElementById(aID);
  if (elem)
  {
    var val = aValue;
    switch (elem.tagName)
    {
      case "checkbox":
        elem.checked = val;
        toggleElemUI(elem);
        break;
      case "html:textarea":
      case "html:input":
        if (Array.isArray(aValue))
        {
          val = "";
          for (var i = 0; i < aValue.length; ++i)
          {
            if (val.length > 0)
              val += '\n';
            val += aValue[i];
          }
        }
        // fallthru
      case "menulist":
      case "richlistbox":
      case "label":
        elem.value = (val) ? val : "";
        break;
      case "description":
        while (elem.firstChild)
          elem.removeChild(elem.firstChild);
        if (val)
          elem.appendChild(document.createTextNode(val));
        break;
    }
  }
}


// Returns true if one or more values were set.
function setBridgeListElemValue(aBridgeArray)
{
  // Trim white space and only keep non-empty values.
  var bridgeList = [];
  if (aBridgeArray)
  {
    for (var i = 0; i < aBridgeArray.length; ++i)
    {
      var s = aBridgeArray[i].trim();
      if (s.length > 0)
        bridgeList.push(s);
    }
  }

  setElemValue(kBridgeList, bridgeList);
  return (bridgeList.length > 0);
}


// Returns a Boolean (for checkboxes/radio buttons) or a
// string (textarea, textbox, and menulist).
// Leading and trailing white space is trimmed from strings.
function getElemValue(aID, aDefaultValue)
{
  var rv = aDefaultValue;
  var elem = document.getElementById(aID);
  if (elem)
  {
    switch (elem.tagName)
    {
      case "checkbox":
        rv = elem.checked;
        break;
      case "radio":
        rv = elem.selected;
        break;
      case "html:textarea":
      case "html:input":
      case "menulist":
      case "richlistbox":
        rv = elem.value;
        break;
    }
  }

  if (rv && ("string" == (typeof rv)))
    rv = rv.trim();

  return rv;
}


function getButton(aButtonName)
{
  let dialogOrWizard = document.querySelector("wizard");
  return dialogOrWizard.getButton(aButtonName);
}


// Hide and show groupbox based on aElem's checked state. aElem may be a
// checkbox or radio element.
function toggleElemUI(aElem)
{
  if (!aElem)
    return;

  let gbID = aElem.getAttribute("groupboxID");
  if (gbID)
  {
    let isOn = getElemValue(aElem.id, false);
    let gb = document.getElementById(gbID);
    if (gb)
      gb.hidden = !isOn;
  }
}


// Separate aStr at the first colon.  Always return a two-element array.
function parseColonStr(aStr)
{
  var rv = ["", ""];
  if (!aStr)
    return rv;

  var idx = aStr.indexOf(":");
  if (idx >= 0)
  {
    if (idx > 0)
      rv[0] = aStr.substring(0, idx);
    rv[1] = aStr.substring(idx + 1);
  }
  else
  {
    rv[0] = aStr;
  }

  return rv;
}


function createColonStr(aStr1, aStr2)
{
  var rv = aStr1;
  if (aStr2)
  {
    if (!rv)
      rv = "";
    rv += ':' + aStr2;
  }

  return rv;
}


function requestMoatCaptcha(aProxySettings, aMeekTransport,
                            aMeekClientPath, aMeekClientArgs)
{
  function cleanup(aMoatRequestor, aErr)
  {
    if (aMoatRequestor)
      aMoatRequestor.close();
    removeAllBridgeDBRequestEventListeners();
    onDismissBridgeDBRequestPrompt();
    if (aErr && (aErr != Cr.NS_ERROR_ABORT))
    {
      let details;
      if (aErr.message)
      {
        details = aErr.message;
      }
      else if (aErr.code)
      {
        if (aErr.code < 1000)
          details = aErr.code;                     // HTTP status code
        else
          details = "0x" + aErr.code.toString(16); // nsresult
      }

      reportMoatError(details);
    }
  }

  let moatRequestor = TorLauncherBridgeDB.createMoatRequestor();

  let cancelListener = function(aEvent) {
    if (!moatRequestor.cancel())
      cleanup(moatRequestor, undefined); // There was no network request to cancel.
  };
  addBridgeDBRequestEventListener(kCaptchaCancelEventType, cancelListener);

  moatRequestor.init(proxyURLFromSettings(aProxySettings), aMeekTransport,
                     aMeekClientPath, aMeekClientArgs)
    .then(()=>
    {
      let bridgeType = TorLauncherUtil.getCharPref(kPrefBridgeDBType,
                                                   "obfs4");
      moatRequestor.fetchBridges([bridgeType])
      .then(aCaptchaInfo =>
      {
        return waitForCaptchaResponse(moatRequestor, aCaptchaInfo);
      })
      .then(aBridgeInfo =>
      {
        // Success! Keep and display the received bridge information.
        cleanup(moatRequestor, undefined);
        gBridgeDBBridges = aBridgeInfo.bridges;
        showBridgeDBBridges();
      })
      .catch(aErr =>
      {
        cleanup(moatRequestor, aErr);
      });
    })
    .catch(aErr =>
    {
      cleanup(moatRequestor, aErr);
    });
} // requestMoatCaptcha


function reportMoatError(aDetails)
{
  if (!aDetails)
    aDetails = "";

  let msg = TorLauncherUtil.getFormattedLocalizedString("unable_to_get_bridge",
                                                        [aDetails], 1);
  showErrorMessage({ message: msg }, false);
}


function proxyURLFromSettings(aProxySettings)
{
  if (!aProxySettings)
    return undefined;

  let proxyURL;
  if (aProxySettings[kTorConfKeySocks4Proxy])
  {
    proxyURL = "socks4a://" + aProxySettings[kTorConfKeySocks4Proxy];
  }
  else if (aProxySettings[kTorConfKeySocks5Proxy])
  {
    proxyURL = "socks5://";
    if (aProxySettings[kTorConfKeySocks5ProxyUsername])
    {
      proxyURL += createColonStr(
                      aProxySettings[kTorConfKeySocks5ProxyUsername],
                      aProxySettings[kTorConfKeySocks5ProxyPassword]);
      proxyURL += "@";
    }
    proxyURL += aProxySettings[kTorConfKeySocks5Proxy];
  }
  else if (aProxySettings[kTorConfKeyHTTPSProxy])
  {
    proxyURL = "http://";
    if (aProxySettings[kTorConfKeyHTTPSProxyAuthenticator])
    {
      proxyURL += aProxySettings[kTorConfKeyHTTPSProxyAuthenticator];
      proxyURL += "@";
    }
    proxyURL += aProxySettings[kTorConfKeyHTTPSProxy];
  }

  return proxyURL;
} // proxyURLFromSettings


// Returns a promise that is resolved with a bridge info object that includes
// a bridges property, which is an array of bridge configuration lines.
function waitForCaptchaResponse(aMoatRequestor, aCaptchaInfo)
{
  let mCaptchaInfo;

  function displayCaptcha(aCaptchaInfoArg)
  {
    mCaptchaInfo = aCaptchaInfoArg;
    let image = document.getElementById(kBridgeDBCaptchaImage);
    if (image)
    {
      image.setAttribute("src", mCaptchaInfo.captchaImage);
      image.style.transition = kCaptchaImageTransition;
      image.style.height = "125px";
    }

    setBridgeDBRequestState(undefined);
    focusCaptchaSolutionTextbox();
  }

  displayCaptcha(aCaptchaInfo);

  return new Promise((aResolve, aReject) =>
  {
    let reloadListener = function(aEvent) {
      // Reset the UI and request a new CAPTCHA.
      resetBridgeDBRequestPrompt();
      setBridgeDBRequestState("fetchingCaptcha");
      aMoatRequestor.fetchBridges([mCaptchaInfo.transport])
      .then(aCaptchaInfoArg =>
      {
        displayCaptcha(aCaptchaInfoArg);
      })
      .catch(aErr =>
      {
        aReject(aErr);
      });
    };

    let submitListener = function(aEvent) {
      mCaptchaInfo.solution = getElemValue(kBridgeDBCaptchaSolution);
      setBridgeDBRequestState("checkingSolution");
      aMoatRequestor.finishFetch(mCaptchaInfo.transport,
                               mCaptchaInfo.challenge, mCaptchaInfo.solution)
      .then(aBridgeInfo =>
      {
        setBridgeDBRequestState(undefined);
        aResolve(aBridgeInfo);
      })
      .catch(aErr =>
      {
        setBridgeDBRequestState(undefined);
        if ((aErr instanceof TorLauncherBridgeDB.error) &&
            (aErr.code == TorLauncherBridgeDB.errorCodeBadCaptcha))
        {
          // Incorrect solution was entered. Allow the user to try again.
          let s = TorLauncherUtil.getLocalizedString("bad_captcha_solution");
          setElemValue(kBridgeDBCaptchaError, s);
          focusCaptchaSolutionTextbox();
        }
        else
        {
          aReject(aErr);
        }
      });
    };

    addBridgeDBRequestEventListener(kCaptchaReloadEventType, reloadListener);
    addBridgeDBRequestEventListener(kCaptchaSubmitEventType, submitListener);
  });
} // waitForCaptchaResponse


function addBridgeDBRequestEventListener(aEventType, aListener)
{
  document.addEventListener(aEventType, aListener, false);
  gBridgeDBRequestEventListeners.push({type: aEventType, listener: aListener});
}


function removeAllBridgeDBRequestEventListeners()
{
  for (let i = gBridgeDBRequestEventListeners.length - 1; i >= 0; --i)
  {
      document.removeEventListener(gBridgeDBRequestEventListeners[i].type,
                          gBridgeDBRequestEventListeners[i].listener, false);
  }

  gBridgeDBRequestEventListeners = [];
}


function focusCaptchaSolutionTextbox()
{
  let textBox = document.getElementById(kBridgeDBCaptchaSolution);
  if (textBox)
  {
    textBox.focus();
    textBox.select();
  }
}
