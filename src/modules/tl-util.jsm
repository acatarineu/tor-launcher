// Copyright (c) 2019, The Tor Project, Inc.
// See LICENSE for licensing information.
//
// vim: set sw=2 sts=2 ts=8 et syntax=javascript:

/*************************************************************************
 * Tor Launcher Util JS Module
 *************************************************************************/

let EXPORTED_SYMBOLS = [ "TorLauncherUtil" ];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;
const kPropBundleURI = "chrome://torlauncher/locale/torlauncher.properties";
const kPropNamePrefix = "torlauncher.";
const kPrefBranchDefaultBridge = "extensions.torlauncher.default_bridge.";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TorLauncherLogger",
                          "resource://torlauncher/modules/tl-logger.jsm");

let TorLauncherUtil =  // Public
{
  get isMac()
  {
    return TLUtilInternal._isMac;
  },

  get isWindows()
  {
    return ("WINNT" == TLUtilInternal._OS);
  },

  isAppVersionAtLeast: function(aVersion)
  {
    var appInfo = Cc["@mozilla.org/xre/app-info;1"]
                    .getService(Ci.nsIXULAppInfo);
    var vc = Cc["@mozilla.org/xpcom/version-comparator;1"]
               .getService(Ci.nsIVersionComparator);
    return (vc.compare(appInfo.version, aVersion) >= 0);
  },

  // Error Reporting / Prompting
  showAlert: function(aParentWindow, aMsg)
  {
    // TODO: alert() does not always resize correctly to fit the message.
    try
    {
      if (!aParentWindow)
      {
        var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Ci.nsIWindowMediator);
        let settingsWindow =
                          wm.getMostRecentWindow("TorLauncher:NetworkSettings");
        if (TLUtilInternal._isWindowVisible(settingsWindow))
        {
          aParentWindow = settingsWindow;
        }
        else
        {
          let browserWindow = wm.getMostRecentWindow("navigator:browser");
          if (TLUtilInternal._isWindowVisible(browserWindow))
            aParentWindow = browserWindow;
        }
      }

      var ps = Cc["@mozilla.org/embedcomp/prompt-service;1"]
                 .getService(Ci.nsIPromptService);
      var title = this.getLocalizedString("error_title");
      ps.alert(aParentWindow, title, aMsg);
    }
    catch (e)
    {
      alert(aMsg);
    }
  },

  // Returns true if user confirms; false if not.
  // Note that no prompt is shown (and false is returned) if the Network Settings
  // window is open.
  showConfirm: function(aParentWindow, aMsg, aDefaultButtonLabel,
                        aCancelButtonLabel)
  {
    try
    {
      if (!aParentWindow)
      {
        var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Ci.nsIWindowMediator);
        aParentWindow = wm.getMostRecentWindow("TorLauncher:NetworkSettings");
        if (aParentWindow)
          return false; // Don't show prompt if Network Settings window is open.

        aParentWindow = wm.getMostRecentWindow("navigator:browser");
      }

      var ps = Cc["@mozilla.org/embedcomp/prompt-service;1"]
                 .getService(Ci.nsIPromptService);
      var title = this.getLocalizedString("error_title");
      var btnFlags = (ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING)
                     + ps.BUTTON_POS_0_DEFAULT
                     + (ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING);

      var notUsed = { value: false };
      var btnIndex =  ps.confirmEx(aParentWindow, title, aMsg, btnFlags,
                                   aDefaultButtonLabel, aCancelButtonLabel,
                                   null, null, notUsed);
      return (0 == btnIndex);
    }
    catch (e)
    {
      return confirm(aMsg);
    }

    return false;
  },

  getSaveSettingsErrorMessage: function(aDetails)
  {
    if (!aDetails)
      aDetails = TorLauncherUtil.getLocalizedString("ensure_tor_is_running");

    return TorLauncherUtil.getFormattedLocalizedString(
                                  "failed_to_save_settings", [aDetails], 1);
  },

  // Localized Strings
  flushLocalizedStringCache: function()
  {
    TLUtilInternal.mStringBundle = undefined;
  },

  // "torlauncher." is prepended to aStringName.
  getLocalizedString: function(aStringName)
  {
    if (!aStringName)
      return aStringName;

    try
    {
      var key = kPropNamePrefix + aStringName;
      return TLUtilInternal._stringBundle.GetStringFromName(key);
    } catch(e) {}

    return aStringName;
  },

  // "torlauncher." is prepended to aStringName.
  getFormattedLocalizedString: function(aStringName, aArray, aLen)
  {
    if (!aStringName || !aArray)
      return aStringName;

    try
    {
      var key = kPropNamePrefix + aStringName;
      return TLUtilInternal._stringBundle.formatStringFromName(key,
                                                               aArray, aLen);
    } catch(e) {}

    return aStringName;
  },

  getLocalizedStringForError: function(aNSResult)
  {
    for (let prop in Cr)
    {
      if (Cr[prop] == aNSResult)
      {
        let key = "nsresult." + prop;
        let rv = this.getLocalizedString(key);
        if (rv !== key)
          return rv;

        return prop;  // As a fallback, return the NS_ERROR... name.
      }
    }

    return undefined;
  },

  getLocalizedBootstrapStatus: function(aStatusObj, aKeyword)
  {
    if (!aStatusObj || !aKeyword)
      return "";

    var result;
    var fallbackStr;
    if (aStatusObj[aKeyword])
    {
      var val = aStatusObj[aKeyword].toLowerCase();
      var key;
      if (aKeyword == "TAG")
      {
        // The bootstrap status tags in tagMap below are used by Tor
        // versions prior to 0.4.0.x. We map each one to the tag that will
        // produce the localized string that is the best fit.
        let tagMap =
        {
          "conn_dir":       "conn",
          "handshake_dir":  "onehop_create",
          "conn_or":        "enough_dirinfo",
          "handshake_or":   "ap_conn"
        };
        if (val in tagMap) val = tagMap[val];

        key = "bootstrapStatus." + val;
        fallbackStr = aStatusObj.SUMMARY;
      }
      else if (aKeyword == "REASON")
      {
        if ("connectreset" == val)
          val = "connectrefused";

        key = "bootstrapWarning." + val;
        fallbackStr = aStatusObj.WARNING;
      }

      result = TorLauncherUtil.getLocalizedString(key);
      if (result == key)
        result = undefined;
    }

    if (!result)
      result = fallbackStr;

    if ((aKeyword == "REASON") && aStatusObj.HOSTADDR)
      result += " - " + aStatusObj.HOSTADDR;

    return (result) ? result : "";
  },

  // Preferences
  loadDefaultPreferences: function()
  {
    return TLUtilInternal._loadPreferences();
  },

  getBoolPref: function(aPrefName, aDefaultVal)
  {
    var rv = (undefined != aDefaultVal) ? aDefaultVal : false;

    try
    {
      rv = TLUtilInternal.mPrefsSvc.getBoolPref(aPrefName);
    } catch (e) {}

    return rv;
  },

  setBoolPref: function(aPrefName, aVal)
  {
    var val = (undefined != aVal) ? aVal : false;
    try
    {
      TLUtilInternal.mPrefsSvc.setBoolPref(aPrefName, val);
    } catch (e) {}
  },

  getIntPref: function(aPrefName, aDefaultVal)
  {
    var rv = aDefaultVal ? aDefaultVal : 0;

    try
    {
      rv = TLUtilInternal.mPrefsSvc.getIntPref(aPrefName);
    } catch (e) {}

    return rv;
  },

  setIntPref: function(aPrefName, aVal)
  {
    var val = (undefined != aVal) ? aVal : 0;
    try
    {
      TLUtilInternal.mPrefsSvc.setIntPref(aPrefName, val);
    } catch (e) {}
  },

  getCharPref: function(aPrefName, aDefaultVal)
  {
    var rv = aDefaultVal ? aDefaultVal : "";

    try
    {
      rv = TLUtilInternal.mPrefsSvc.getCharPref(aPrefName);
    } catch (e) {}

    return rv;
  },

  setCharPref: function(aPrefName, aVal)
  {
    try
    {
      TLUtilInternal.mPrefsSvc.setCharPref(aPrefName, aVal ? aVal : "");
    } catch (e) {}
  },

  clearUserPref: function(aPrefName)
  {
    try
    {
      TLUtilInternal.mPrefsSvc.clearUserPref(aPrefName);
    } catch (e) {}
  },

  getPrefBranch: function(aBranchName)
  {
    return Cc["@mozilla.org/preferences-service;1"]
             .getService(Ci.nsIPrefService)
             .getBranch(aBranchName);
  },

  // Currently, this returns a random permutation of an array, bridgeArray.
  // Later, we might want to change this function to weight based on the
  // bridges' bandwidths.
  rearrangeBridges: function(bridgeArray)
  {
    for (var j, x, i = bridgeArray.length; i;
           j = parseInt(Math.random() * i),
           x = bridgeArray[--i],
           bridgeArray[i] = bridgeArray[j],
           bridgeArray[j] = x);
    return bridgeArray;
  },

  get shouldStartAndOwnTor()
  {
    const kPrefStartTor = "extensions.torlauncher.start_tor";
    try
    {
      const kEnvSkipLaunch = "TOR_SKIP_LAUNCH";
      const kBrowserToolboxPort = "MOZ_BROWSER_TOOLBOX_PORT";

      var env = Cc["@mozilla.org/process/environment;1"]
                  .getService(Ci.nsIEnvironment);
      if (env.exists(kBrowserToolboxPort))
        return false;
      if (env.exists(kEnvSkipLaunch))
        return ("1" != env.get(kEnvSkipLaunch));
    } catch(e) {}

    return this.getBoolPref(kPrefStartTor, true);
  },

  get shouldPromptForLocale()
  {
    // We are not supporting locale selection on the alpha/stable channel
    // right now. Thus, no prompt for the user.
    return false;
    /* const kPrefPromptForLocale = "extensions.torlauncher.prompt_for_locale";
    try
    {
      const kEnvSkipLocalePrompt = "TOR_SKIP_LOCALE_PROMPT";

      var env = Cc["@mozilla.org/process/environment;1"]
                  .getService(Ci.nsIEnvironment);
      if (env.exists(kEnvSkipLocalePrompt))
        return ("1" != env.get(kEnvSkipLocalePrompt));
    } catch(e) {}

    return this.getBoolPref(kPrefPromptForLocale, true); */
  },

  get shouldShowNetworkSettings()
  {
    const kPrefPromptAtStartup = "extensions.torlauncher.prompt_at_startup";
    try
    {
      const kEnvForceShowNetConfig = "TOR_FORCE_NET_CONFIG";

      var env = Cc["@mozilla.org/process/environment;1"]
                  .getService(Ci.nsIEnvironment);
      if (env.exists(kEnvForceShowNetConfig))
        return ("1" == env.get(kEnvForceShowNetConfig));
    } catch(e) {}

    return this.getBoolPref(kPrefPromptAtStartup, true);
  },

  get shouldOnlyConfigureTor()
  {
    const kPrefOnlyConfigureTor = "extensions.torlauncher.only_configure_tor";
    try
    {
      const kEnvOnlyConfigureTor = "TOR_CONFIGURE_ONLY";

      var env = Cc["@mozilla.org/process/environment;1"]
                  .getService(Ci.nsIEnvironment);
      if (env.exists(kEnvOnlyConfigureTor))
        return ("1" == env.get(kEnvOnlyConfigureTor));
    } catch(e) {}

    return this.getBoolPref(kPrefOnlyConfigureTor, false);
  },

  // Returns an array of strings or undefined if none are available.
  get defaultBridgeTypes()
  {
    try
    {
      var prefBranch = this.getPrefBranch(kPrefBranchDefaultBridge);
      var childPrefs = prefBranch.getChildList("", []);
      var typeArray = [];
      for (var i = 0; i < childPrefs.length; ++i)
      {
        var s = childPrefs[i].replace(/\..*$/, "");
        if (-1 == typeArray.lastIndexOf(s))
          typeArray.push(s);
      }

      return typeArray.sort();
    } catch(e) {};

    return undefined;
  },

  // Returns an array of strings or undefined if none are available.
  // The list is filtered by the default_bridge_type pref value.
  get defaultBridges()
  {
    const kPrefName = "extensions.torlauncher.default_bridge_type";
    var filterType = this.getCharPref(kPrefName);
    if (!filterType)
      return undefined;

    try
    {
      var prefBranch = this.getPrefBranch(kPrefBranchDefaultBridge);
      var childPrefs = prefBranch.getChildList("", []);
      var bridgeArray = [];
      // The pref service seems to return the values in reverse order, so
      // we compensate by traversing in reverse order.
      for (var i = childPrefs.length - 1; i >= 0; --i)
      {
        var bridgeType = childPrefs[i].replace(/\..*$/, "");
        if (bridgeType == filterType)
        {
          var s = prefBranch.getCharPref(childPrefs[i]);
          if (s)
            bridgeArray.push(s);
        }
      }
      this.rearrangeBridges(bridgeArray);

      return bridgeArray;
    } catch(e) {};

    return undefined;
  },

  // Returns an nsIFile.
  // If aTorFileType is "control_ipc" or "socks_ipc", aCreate is ignored
  // and there is no requirement that the IPC object exists.
  // For all other file types, null is returned if the file does not exist
  // and it cannot be created (it will be created if aCreate is true).
  getTorFile: function(aTorFileType, aCreate)
  {
    if (!aTorFileType)
      return null;

    let torFile;  // an nsIFile to be returned
    let path;     // a relative or absolute path that will determine torFile

    let isRelativePath = false;
    let isUserData = (aTorFileType != "tor") &&
                     (aTorFileType != "pt-startup-dir") &&
                     (aTorFileType != "torrc-defaults");
    let isControlIPC = ("control_ipc" == aTorFileType);
    let isSOCKSIPC = ("socks_ipc" == aTorFileType);
    let isIPC = isControlIPC || isSOCKSIPC;
    let checkIPCPathLen = true;
    let useAppDir = false;

    const kControlIPCFileName = "control.socket";
    const kSOCKSIPCFileName = "socks.socket";
    let extraIPCPathLen = (isSOCKSIPC) ? 2 : 0;
    let ipcFileName;
    if (isControlIPC)
      ipcFileName = kControlIPCFileName;
    else if (isSOCKSIPC)
      ipcFileName = kSOCKSIPCFileName;

    // If this is the first request for an IPC path during this browser
    // session, remove the old temporary directory. This helps to keep /tmp
    // clean if the browser crashes or is killed.
    let ipcDirPath;
    if (isIPC && TLUtilInternal.mIsFirstIPCPathRequest)
    {
      this.cleanupTempDirectories();
      TLUtilInternal.mIsFirstIPCPathRequest = false;
    }
    else
    {
      // Retrieve path for IPC objects (it may have already been determined).
      ipcDirPath = this.getCharPref(TLUtilInternal.kIPCDirPrefName);
    }

    // First, check the _path preference for this file type.
    let prefName = "extensions.torlauncher." + aTorFileType + "_path";
    path = this.getCharPref(prefName);
    if (path)
    {
      let re = (this.isWindows) ?  /^[A-Za-z]:\\/ : /^\//;
      isRelativePath = !re.test(path);
      checkIPCPathLen = false; // always try to use path if provided in pref
    }
    else if (isIPC)
    {
      if (ipcDirPath)
      {
        // We have already determined where IPC objects will be placed.
        torFile = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        torFile.initWithPath(ipcDirPath);
        torFile.append(ipcFileName);
        checkIPCPathLen = false; // already checked.
      }
      else
      {
        // If XDG_RUNTIME_DIR is set, use it as the base directory for IPC
        // objects (e.g., Unix domain sockets) -- assuming it is not too long.
        let env = Cc["@mozilla.org/process/environment;1"]
                    .getService(Ci.nsIEnvironment);
        if (env.exists("XDG_RUNTIME_DIR"))
        {
          let ipcDir = TLUtilInternal._createUniqueIPCDir(
                                               env.get("XDG_RUNTIME_DIR"));
          if (ipcDir)
          {
            let f = ipcDir.clone();
            f.append(ipcFileName);
            if (TLUtilInternal._isIPCPathLengthOK(f.path, extraIPCPathLen))
            {
              torFile = f;
              checkIPCPathLen = false; // no need to check again.

              // Store directory path so it can be reused for other IPC objects
              // and so it can be removed during exit.
              this.setCharPref(TLUtilInternal.kIPCDirPrefName, ipcDir.path);
            }
            else
            {
              // too long; remove the directory that we just created.
              ipcDir.remove(false);
            }
          }
        }
      }
    }

    if (!path && !torFile)
    {
      // No preference and no pre-determined IPC path: use a default path.
      isRelativePath = true;
      if (TLUtilInternal._isUserDataOutsideOfAppDir)
      {
        // This block is used for the TorBrowser-Data/ case.
        if (this.isWindows)
        {
          if ("tor" == aTorFileType)
            path = "TorBrowser\\Tor\\tor.exe";
          else if ("pt-startup-dir" == aTorFileType)
            useAppDir = true;
          else if ("torrc-defaults" == aTorFileType)
            path = "TorBrowser\\Tor\\torrc-defaults";
          else if ("torrc" == aTorFileType)
            path = "Tor\\torrc";
          else if ("tordatadir" == aTorFileType)
            path = "Tor";
          else if ("pt-profiles-dir" == aTorFileType)
            path = "Tor\\PluggableTransports";
        }
        else if (this.isMac)
        {
          if ("tor" == aTorFileType)
            path = "Contents/Resources/TorBrowser/Tor/tor";
          else if ("pt-startup-dir" == aTorFileType)
            path = "Contents/MacOS/Tor";
          else if ("torrc-defaults" == aTorFileType)
            path = "Contents/Resources/TorBrowser/Tor/torrc-defaults";
          else if ("torrc" == aTorFileType)
            path = "Tor/torrc";
          else if ("tordatadir" == aTorFileType)
            path = "Tor";
          else if ("pt-profiles-dir" == aTorFileType)
            path = "Tor/PluggableTransports";
          else if (isIPC)
            path = "Tor/" + ipcFileName;
        }
        else // Linux and others.
        {
          if ("tor" == aTorFileType)
            path = "TorBrowser/Tor/tor";
          else if ("pt-startup-dir" == aTorFileType)
            useAppDir = true;
          else if ("torrc-defaults" == aTorFileType)
            path = "TorBrowser/Tor/torrc-defaults";
          else if ("torrc" == aTorFileType)
            path = "Tor/torrc";
          else if ("tordatadir" == aTorFileType)
            path = "Tor";
          else if ("pt-profiles-dir" == aTorFileType)
            path = "Tor/PluggableTransports";
          else if (isIPC)
            path = "Tor/" + ipcFileName;
        }
      }
      else if (this.isWindows)
      {
        // This block is used for the non-TorBrowser-Data/ case.
        if ("tor" == aTorFileType)
          path = "Tor\\tor.exe";
        else if ("pt-startup-dir" == aTorFileType)
          useAppDir = true;
        else if ("torrc-defaults" == aTorFileType)
          path = "Data\\Tor\\torrc-defaults";
        else if ("torrc" == aTorFileType)
          path = "Data\\Tor\\torrc";
        else if ("tordatadir" == aTorFileType)
          path = "Data\\Tor";
        else if ("pt-profiles-dir" == aTorFileType)
          path = "Data\\Browser";
        }
      else // Linux, Mac OS and others.
      {
        // This block is also used for the non-TorBrowser-Data/ case.
        if ("tor" == aTorFileType)
          path = "Tor/tor";
        else if ("pt-startup-dir" == aTorFileType)
          useAppDir = true;
        else if ("torrc-defaults" == aTorFileType)
          path = "Data/Tor/torrc-defaults";
        else if ("torrc" == aTorFileType)
          path = "Data/Tor/torrc";
        else if ("tordatadir" == aTorFileType)
          path = "Data/Tor";
        else if ("pt-profiles-dir" == aTorFileType)
          path = "Data/Browser";
        else if (isIPC)
          path = "Data/Tor/" + ipcFileName;
      }

      if (!path && !useAppDir)
        return null;
    }

    try
    {
      if (useAppDir)
      {
        torFile = TLUtilInternal._appDir.clone();
      }
      else if (path)
      {
        if (isRelativePath)
        {
          // Turn 'path' into an absolute path.
          if (TLUtilInternal._isUserDataOutsideOfAppDir)
          {
            let baseDir = isUserData ? TLUtilInternal._dataDir
                                     : TLUtilInternal._appDir;
            torFile = baseDir.clone();
          }
          else
          {
            torFile = TLUtilInternal._appDir.clone();
            torFile.append("TorBrowser");
          }
          torFile.appendRelativePath(path);
        }
        else
        {
          torFile = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
          torFile.initWithPath(path);
        }

        if (!torFile.exists() && !isIPC && aCreate)
        {
          try
          {
            if (("tordatadir" == aTorFileType) ||
                ("pt-profiles-dir" == aTorFileType))
            {
              torFile.create(torFile.DIRECTORY_TYPE, 0o700);
            }
            else
            {
              torFile.create(torFile.NORMAL_FILE_TYPE, 0o600);
            }
          }
          catch (e)
          {
            TorLauncherLogger.safelog(4,
                                "unable to create " + torFile.path + ": ", e);
            return null;
          }
        }
      }

      // If the file exists or an IPC object was requested, normalize the path
      // and return a file object. The control and SOCKS IPC objects will be
      // created by tor.
      if (torFile.exists() || isIPC)
      {
        try { torFile.normalize(); } catch(e) {}

        // Ensure that the IPC path length is short enough for use by the
        // operating system. If not, create and use a unique directory under
        // /tmp for all IPC objects. The created directory path is stored in
        // a preference so it can be reused for other IPC objects and so it
        // can be removed during exit.
        if (isIPC && checkIPCPathLen &&
            !TLUtilInternal._isIPCPathLengthOK(torFile.path, extraIPCPathLen))
        {
          torFile = TLUtilInternal._createUniqueIPCDir("/tmp");
          if (!torFile)
          {
            TorLauncherLogger.log(4,
                              "failed to create unique directory under /tmp");
            return null;
          }

          this.setCharPref(TLUtilInternal.kIPCDirPrefName, torFile.path);
          torFile.append(ipcFileName);
        }

        return torFile;
      }

      TorLauncherLogger.log(4, aTorFileType + " file not found: "
                               + torFile.path);
    }
    catch(e)
    {
      TorLauncherLogger.safelog(4, "getTorFile " + aTorFileType +
                                   " failed for " + path + ": ", e);
    }

    return null;  // File not found or error (logged above).
  }, // getTorFile()

  cleanupTempDirectories: function()
  {
    try
    {
      let dirPath = this.getCharPref(TLUtilInternal.kIPCDirPrefName);
      this.clearUserPref(TLUtilInternal.kIPCDirPrefName);
      if (dirPath)
      {
        let f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        f.initWithPath(dirPath);
        if (f.exists())
          f.remove(false); // Remove directory if it is empty
      }
    } catch(e) {}
  },
};


Object.freeze(TorLauncherUtil);


let TLUtilInternal =  // Private
{
  kThunderbirdID: "{3550f703-e582-4d05-9a08-453d09bdfdc6}",
  kInstantbirdID: "{33cb9019-c295-46dd-be21-8c4936574bee}",
  kIPCDirPrefName: "extensions.torlauncher.tmp_ipc_dir",

  mPrefsSvc : null,
  mStringBundle : null,
  mOS : "",
  // mIsUserDataOutsideOfAppDir is true when TorBrowser-Data is used.
  mIsUserDataOutsideOfAppDir: undefined, // Boolean (cached; access via
                                         //   this._isUserDataOutsideOfAppDir)
  mAppDir: null,        // nsIFile (cached; access via this._appDir)
  mDataDir: null,       // nsIFile (cached; access via this._dataDir)
  mIsFirstIPCPathRequest : true,
  mNumDefaultPrefsDefined: 0,
  mNumDefaultPrefsLoaded: 0,
  mDefaultPreferencesLoaded: false,

  _init: function()
  {
    this.mPrefsSvc = Cc["@mozilla.org/preferences-service;1"]
                       .getService(Ci.nsIPrefBranch);
  },

  _getPrefDefaultBranch: function(aBranchName)
  {
    return Cc["@mozilla.org/preferences-service;1"]
             .getService(Ci.nsIPrefService)
             .getDefaultBranch(aBranchName);
  },

  _setPref: function(aSetPrefFunc, aPrefName, aValue)
  {
    try
    {
      aSetPrefFunc(aPrefName, aValue);
    }
    catch(e)
    {
      TorLauncherLogger.log(5, "Setting default pref '" + aPrefName +
           "' threw exception: " + e);
      return false;
    }

    return true;
  },

  pref: function (aPrefName, aValue)
  {
    // Increment this counter for each pref() call.
    this.mNumDefaultPrefsDefined += 1;

    let lastPeriod = aPrefName.lastIndexOf(".");
    // This pref doesn't contain a period (".")
    // or the period is the first character.
    if (lastPeriod == 0 || lastPeriod == -1)
    {
      TorLauncherLogger.log(5, "Ignoring invalid pref '" + aPrefName + "'");
      return;
    }
    // This pref has a period at the last character, we can't set
    // a default value on a pref root.
    if (aPrefName.length == (lastPeriod + 1))
    {
      TorLauncherLogger.log(5,
            "Ignoring invalid pref ending with a period: '" + aPrefName + "'");
      return;
    }

    let prefRoot = aPrefName.substring(0, lastPeriod + 1);
    let defaultBranch = this._getPrefDefaultBranch(prefRoot);
    let prefName = aPrefName.substring(lastPeriod + 1);
    let setPrefFunc;
    switch (typeof aValue)
    {
      case "boolean":
        setPrefFunc = defaultBranch.setBoolPref;
        if (!this._setPref(setPrefFunc, prefName, aValue))
        {
          return;
        }
        break;
      case "number":
        setPrefFunc = defaultBranch.setIntPref;
        if (!this._setPref(setPrefFunc, prefName, aValue))
        {
          return;
        }
        break;
      case "string":
        setPrefFunc = defaultBranch.setCharPref;
        if (!this._setPref(setPrefFunc, prefName, aValue))
        {
          return;
        }
        break;
      default:
        TorLauncherLogger.log(5, "Cowardly not setting pref '" +
             aPrefName + "' of type '" + (typeof aValue) + "'");
        return;
    }

    // Increment this counter for each pref() call where the default preference
    // was successfully set.
    this.mNumDefaultPrefsLoaded += 1;
  },

  _loadPreferences: function()
  {
    if (this.mDefaultPreferencesLoaded)
    {
      return this.mDefaultPreferencesLoaded;
    }

    // Check whether default preferences have already been loaded, e.g.,
    // because Tor Launcher is integrated into the browser rather than
    // running as an extension. This code assumes that a default value is
    // defined for extensions.torlauncher.loglevel.
    let prefName = "extensions.torlauncher.loglevel";
    let val;
    try
    {
      let defaultBranch = this._getPrefDefaultBranch(prefName);
      val = defaultBranch.getIntPref("");
    } catch (e) {}
    if (val !== undefined)
    {
      this.mDefaultPreferencesLoaded = true;
      return true;
    }

    // Use the JS subscript loaded in conjunction with our pref() function
    // to load the default preferences.
    const kPrefsURL =
          "resource://torlauncher/defaults/preferences/torlauncher-prefs.js";
    var loader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                       .getService(Ci.mozIJSSubScriptLoader);
    loader.loadSubScript(kPrefsURL, this);

    this.mDefaultPreferencesLoaded =
          (this.mNumDefaultPrefsDefined == this.mNumDefaultPrefsLoaded);
    return this.mDefaultPreferencesLoaded;
  },

  get _stringBundle()
  {
    if (!this.mStringBundle)
    {
      this.mStringBundle = Cc["@mozilla.org/intl/stringbundle;1"]
                             .getService(Ci.nsIStringBundleService)
                             .createBundle(kPropBundleURI);
    }

    return this.mStringBundle;
  },

  get _OS()
  {
    if (!this.mOS) try
    {
      var xr = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
      this.mOS = xr.OS;
    } catch (e) {}

    return this.mOS;
  },

  get _isMac()
  {
    return ("Darwin" == this._OS);
  },

  get _isUserDataOutsideOfAppDir()
  {
    if (this.mIsUserDataOutsideOfAppDir == undefined)
    {
      // Determine if we are using a "side-by-side" data model by checking
      // whether the user profile is outside of the app directory.
      try
      {
        let ds = Cc["@mozilla.org/file/directory_service;1"]
                        .getService(Ci.nsIProperties);
        let profDir = ds.get("ProfD", Ci.nsIFile);
        this.mIsUserDataOutsideOfAppDir = !this._appDir.contains(profDir);
      }
      catch (e)
      {
        this.mIsUserDataOutsideOfAppDir = false;
      }
    }

    return this.mIsUserDataOutsideOfAppDir;
  }, // get _isUserDataOutsideOfAppDir

  // Returns an nsIFile that points to the application directory.
  // May throw.
  get _appDir()
  {
    if (!this.mAppDir)
    {
      let topDir = Cc["@mozilla.org/file/directory_service;1"]
                    .getService(Ci.nsIProperties).get("CurProcD", Ci.nsIFile);
      let appInfo = Cc["@mozilla.org/xre/app-info;1"]
                      .getService(Ci.nsIXULAppInfo);
      // On Linux and Windows, we want to return the Browser/ directory.
      // Because topDir ("CurProcD") points to Browser/browser on those
      // platforms, we need to go up one level.
      // On Mac OS, we want to return the TorBrowser.app/ directory.
      // Because topDir points to Contents/Resources/browser on Mac OS,
      // we need to go up 3 levels.
      let tbbBrowserDepth = (this._isMac) ? 3 : 1;
      if ((appInfo.ID == this.kThunderbirdID) ||
          (appInfo.ID == this.kInstantbirdID))
      {
        // On Thunderbird/Instantbird, the topDir is the root dir and not
        // browser/, so we need to iterate one level less than Firefox.
        --tbbBrowserDepth;
      }

      while (tbbBrowserDepth > 0)
      {
        let didRemove = (topDir.leafName != ".");
        topDir = topDir.parent;
        if (didRemove)
          tbbBrowserDepth--;
      }

      this.mAppDir = topDir;
    }

    return this.mAppDir;
  }, // get _appDir

  // Returns an nsIFile that points to the TorBrowser-Data/ directory.
  // This function is only used when this._isUserDataOutsideOfAppDir == true.
  // May throw.
  get _dataDir()
  {
    if (!this.mDataDir)
    {
      let ds = Cc["@mozilla.org/file/directory_service;1"]
                      .getService(Ci.nsIProperties);
      let profDir = ds.get("ProfD", Ci.nsIFile);
      this.mDataDir = profDir.parent.parent;
    }

    return this.mDataDir;
  }, // get _dataDir

  // Return true if aPath is short enough to be used as an IPC object path,
  // e.g., for a Unix domain socket path. aExtraLen is the "delta" necessary
  // to accommodate other IPC objects that have longer names; it is used to
  // account for "control.socket" vs. "socks.socket" (we want to ensure that
  // all IPC objects are placed in the same parent directory unless the user
  // has set prefs or env vars to explicitly specify the path for an object).
  // We enforce a maximum length of 100 because all operating systems allow
  // at least 100 characters for Unix domain socket paths.
  _isIPCPathLengthOK: function(aPath, aExtraLen)
  {
    const kMaxIPCPathLen = 100;
    return aPath && ((aPath.length + aExtraLen) <= kMaxIPCPathLen);
  },

  // Returns an nsIFile or null if a unique directory could not be created.
  _createUniqueIPCDir: function(aBasePath)
  {
    try
    {
      let d = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
      d.initWithPath(aBasePath);
      d.append("Tor");
      d.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o700);
      return d;
    }
    catch (e)
    {
      TorLauncherLogger.safelog(4, "_createUniqueIPCDir failed for "
                                   + aBasePath + ": ", e);
      return null;
    }
  },

  _isWindowVisible: function(aWindow)
  {
    if (!aWindow)
      return false;

    try {
      let winUtils = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                            .getInterface(Ci.nsIDOMWindowUtils);
      return winUtils.isParentWindowMainWidgetVisible;
    } catch(e) {}

    return false;
  },
};


TLUtilInternal._init();
