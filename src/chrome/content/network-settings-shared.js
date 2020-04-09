// Copyright (c) 2019, The Tor Project, Inc.
// See LICENSE for licensing information.
//
// vim: set sw=2 sts=2 ts=8 et syntax=javascript:

var proxySettings = `
  <vbox id="proxySettings">
    <hbox align="center">
      <checkbox id="useProxy" groupboxID="proxySpecificSettings"
                  label="&torsettings.useProxy.checkbox;"
                  oncommand="toggleElemUI(this)"/>
      <button class="helpButton" oncommand="onOpenHelp('proxyHelpContent')"/>
    </hbox>
    <groupbox id="proxySpecificSettings">
      <grid flex="1">
        <columns>
          <column/>
          <column/>
        </columns>
        <rows>
          <row align="center">
            <label value="&torsettings.useProxy.type;" control="proxyType"
                   class="rightAlign"/>
            <hbox align="center">
              <menulist id="proxyType" sizetopopup="always"
                        placeholder="&torsettings.useProxy.type.placeholder;"
                        oncommand="onProxyTypeChange()">
                <menupopup id="proxyType_menuPopup">
                  <menuitem label="&torsettings.useProxy.type.socks4;"
                            value="SOCKS4"/>
                  <menuitem label="&torsettings.useProxy.type.socks5;"
                            value="SOCKS5"/>
                  <menuitem label="&torsettings.useProxy.type.http;"
                            value="HTTP"/>
                </menupopup>
              </menulist>
            </hbox>
          </row>
          <row align="center">
            <label value="&torsettings.useProxy.address;" control="proxyAddr"
                   class="rightAlign"/>
            <hbox align="center">
              <html:input id="proxyAddr" size="20" style="-moz-box-flex: 1;"
                       placeholder="&torsettings.useProxy.address.placeholder;"/>
              <separator orient="vertical"/>
              <label value="&torsettings.useProxy.port;" control="proxyPort"/>
              <html:input id="proxyPort" size="4"/>
            </hbox>
          </row>
          <row align="center">
            <label id="proxyUsernameLabel"
                   value="&torsettings.useProxy.username;"
                   control="proxyUsername" class="rightAlign"/>
            <hbox align="center">
              <html:input id="proxyUsername" size="14" style="-moz-box-flex: 1;"
                       placeholder="&torsettings.optional;"/>
              <separator orient="vertical"/>
              <label id="proxyPasswordLabel"
                     value="&torsettings.useProxy.password;"
                     control="proxyPassword"/>
              <html:input id="proxyPassword" size="14" type="password"
                       placeholder="&torsettings.optional;"/>
            </hbox>
          </row>
        </rows>
      </grid>
    </groupbox>
  </vbox>
`;

var proxyHelpContent = `
  <vbox id="proxyHelpContent" hidden="true">
    <hbox align="middle"><label>&torsettings.proxyHelpTitle;</label></hbox>
    <description>&torsettings.proxyHelp1;</description>
  </vbox>
`;

var bridgeSettings = `
  <vbox id="bridgeSettings">
    <checkbox id="useBridges" groupboxID="bridgeSpecificSettings"
                label="&torsettings.useBridges.checkbox;"
                oncommand="toggleElemUI(this);"/>
    <groupbox id="bridgeSpecificSettings">
      <hbox align="end" pack="end">
        <radiogroup id="bridgeTypeRadioGroup" flex="1" style="margin: 0px">
          <hbox class="bridgeRadioContainer">
            <radio id="bridgeRadioDefault"
                   label="&torsettings.useBridges.default;" selected="true"
                   oncommand="onBridgeTypeRadioChange()"/>
            <vbox pack="center">
              <button class="helpButton"
                      oncommand="onOpenHelp('bridgeHelpContent')"/>
            </vbox>
            <spacer style="width: 3em"/>
            <menulist id="defaultBridgeType" sizetopopup="always"
                  placeholder="&torsettings.useBridges.default.placeholder;">
              <menupopup id="defaultBridgeType_menuPopup"/>
            </menulist>
            <spring/>
          </hbox>

          <vbox id="bridgeDBSettings">
            <hbox class="bridgeRadioContainer">
              <radio id="bridgeRadioBridgeDB"
                     label="&torsettings.useBridges.bridgeDB;"
                     oncommand="onBridgeTypeRadioChange()"/>
            </hbox>
            <vbox id="bridgeDBContainer" align="start">
              <description id="bridgeDBResult"/>
              <button id="bridgeDBRequestButton"
                      oncommand="onOpenBridgeDBRequestPrompt()"/>
            </vbox>
          </vbox>

          <hbox class="bridgeRadioContainer">
            <radio align="start" id="bridgeRadioCustom"
                   label="&torsettings.useBridges.custom;"
                   oncommand="onBridgeTypeRadioChange()"/>
          </hbox>
        </radiogroup>
      </hbox>
      <vbox id="bridgeCustomEntry">
        <label id="bridgeListLabel" style="margin-top:0px;"
               value="&torsettings.useBridges.label;" control="bridgeList"/>
        <html:textarea id="bridgeList" rows="3" wrap="off"
                       oninput="onCustomBridgesTextInput();"
                       placeholder="&torsettings.useBridges.placeholder;"/>
      </vbox>
    </groupbox>
  </vbox>
`;

var bridgeHelpContent = `
  <vbox id="bridgeHelpContent" hidden="true">
    <hbox align="middle"><label>&torsettings.bridgeHelpTitle;</label></hbox>
    <description>&torsettings.bridgeHelp1;</description>
    <description>&torsettings.bridgeHelp2;</description>
  </vbox>
`;

var progressContent = `
  <vbox id="progressContent">
    <hbox class="tbb-header" pack="center">
      <image class="tbb-logo"/>
    </hbox>
    <vbox flex="1">
      <description id="progressPleaseWait"
                   hidden="true">&torprogress.pleaseWait;</description>
      <html:progress id="progressMeter" value="0" max="100"/>
      <description id="progressDesc" errorElemId="message"/>
      <label id="progressReconfigureLabel" hidden="true"
             value="&torsettings.reconfigTor;"/>
    </vbox>
  </vbox>
`;

var restartContent = `
  <vbox id="restartContent">
    <hbox pack="center">
      <description id="restartPanelMessage" flex="1"/>
    </hbox>
    <separator/>
    <hbox pack="center">
      <button id="restartTorButton" label="&torsettings.restartTor;"
              oncommand="onRestartTor()"/>
    </hbox>
  </vbox>
`;

var bridgeDBRequestOverlayContent = `
  <vbox id="bridgeDBRequestOverlayContent" align="center">
    <vbox>
      <label id="bridgeDBPrompt"/>
      <image id="bridgeDBCaptchaImage"/>
      <hbox>
        <spacer id="bridgeDBReloadSpacer"/>
        <spacer flex="1"/>
        <html:input id="bridgeDBCaptchaSolution" size="35"
          placeholder="&torsettings.useBridges.captchaSolution.placeholder;"
          oninput="onCaptchaSolutionChange()"/>
        <spacer flex="1"/>
        <deck id="bridgeDBReloadDeck">
          <button id="bridgeDBReloadCaptchaButton"
                  tooltiptext="&torsettings.useBridges.reloadCaptcha.tooltip;"
                  oncommand="onReloadCaptcha()"/>
          <image id="bridgeDBNetworkActivity"/>
        </deck>
      </hbox>
      <label id="bridgeDBCaptchaError"/>
      <separator/>
      <hbox pack="center">
        <button id="bridgeDBCancelButton"
                oncommand="onCancelBridgeDBRequestPrompt()"/>
        <button id="bridgeDBSubmitButton" disabled="true"
                label="&torsettings.useBridges.captchaSubmit;"
                oncommand="onCaptchaSolutionSubmit()"/>
      </hbox>
    </vbox>
  </vbox>
`;

var errorOverlayContent = `
  <vbox id="errorOverlayContent">
    <hbox pack="center">
      <description errorElemId="message" flex="1"/>
    </hbox>
    <separator/>
    <hbox pack="center">
      <button errorElemId="dismissButton" default="true"
              oncommand="onDismissErrorOverlay()"/>
    </hbox>
  </vbox>
`;

var copyLogFeedbackPanel = `
  <panel id="copyLogFeedbackPanel" type="arrow" fade="slow"
         onclick="closeCopyLogFeedbackPanel()">
     <description flex="1"/>
  </panel>
`;
