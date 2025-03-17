'use strict';
/**********************************************************************
 * Copyright (C) 2025 BitCtrl Systems GmbH
 * 
 * hotfix6890.js
 * 
 * @author  Daniel Hammerschmidt <daniel.hammerschmidt@bitctrl.de>
 * @author  Daniel Hammerschmidt <daniel@redneck-engineering.com>
 * @version 0.0.1
 *********************************************************************/

const { sep: PATH_SEP } = require('node:path');

const PLUGIN_SHORT_NAME = __dirname.split(PATH_SEP).pop();

const kMeshUser = Symbol(PLUGIN_SHORT_NAME + '/meshuser');

module.exports[PLUGIN_SHORT_NAME] = function (pluginHandler) {
  const meshserver = pluginHandler.parent;
  let webserver;

  function _WebSocket_addListener(addListener, hook, ws, eventName, listener) {
    if (eventName === 'message') {
      listener = hook.bind(null, listener, ws);
      ws.addListener = addListener;
    }
    return addListener.call(ws, eventName, listener);
  }

  function getNoVncViewOnlyPort(nodeid, tcpport) {
    const nodename = webserver.wsagents[nodeid].agentName || webserver.wsagents[nodeid].name;
    const meshid = webserver.wsagents[nodeid].dbMeshKey;
    const meshname = webserver.meshes[meshid].name;
    const domainid = nodeid.split('/')[1];
    const domainConfig = meshserver.config.domains[domainid];
    let novncvop = domainConfig.novncviewonlyport;
    if (typeof novncvop === 'number') { return novncvop; }
    if (Array.isArray(novncvop)) { novncvop = domainConfig.novncviewonlyport = Object.fromEntries(novncvop); }
    const tokens = [meshid, `mesh/${domainid}/${meshname}`, nodeid, `node/${domainid}/${nodename}`, '*'];
    tokens.some((val) => ((val = +novncvop[val]) ? ((tcpport = val), true) : false));
    return tcpport;
  }

  function _MeshUserWebSocketSend(send, ws, rawdata, callback) {
    switch (0) { default:
      if (typeof rawdata !== 'string' || rawdata.length < 2 || rawdata[0] !== '{' || rawdata.indexOf('"type":"userSessions"') === -1) { break; }
      let dirty = false, data = JSON.parse(rawdata);
      if (data.action !== 'msg' || data.type !== 'userSessions') { break; }
      if (ws[kMeshUser].user.siteadmin === 0xFFFFFFFF) { break; }
      data.data = Object.fromEntries(Object.entries(data.data).filter(([k,v]) => (!v.StationName.toUpperCase().startsWith('RDP-') || ((dirty = true), false))));
      if (dirty) { rawdata = JSON.stringify(data); }
    }
    return send.call(ws, rawdata, callback);
  }

  function _MeshUserWebSocketRecv(recv, ws, rawdata, isBinary) {
    switch (0) { default:
      if (typeof rawdata !== 'string' || rawdata.length < 2 || rawdata[0] !== '{' ||  rawdata.indexOf('"action":"getcookie"') === -1) { break; }
      let dirty = false, data = JSON.parse(rawdata);
      if (data.action !== 'getcookie') { break; }
      if( ws[kMeshUser].user.siteadmin === 0xFFFFFFFF ) { break; }
      switch (data.tag) {
        case 'novnc': { dirty = true; data.tcpport = getNoVncViewOnlyPort(data.nodeid, data.tcpport); break; }
        case 'mstsc': { dirty = true; data = { action: '' }; break; }
        case 'ssh': { dirty = true ; data = { action: '' }; break; }
      }
      if (dirty) { rawdata = JSON.stringify(data); }
    }
    return recv.call(ws, rawdata, isBinary);
  }

  function _CreateMeshUser(CreateMeshUser, meshUserHandler, parent, db, ws, req, args, domain, user) {
    ws.send = _MeshUserWebSocketSend.bind(null, ws.send, ws);
    ws.addListener = ws.on = _WebSocket_addListener.bind(null, ws.addListener, _MeshUserWebSocketRecv, ws);
    return (ws[kMeshUser] = CreateMeshUser.call(meshUserHandler, parent, db, ws, req, args, domain, user));
  }

  function _CreateMeshRelay(CreateMeshRelay, meshRelayHandler, parent, ws, req, domain, user, cookie) {
    switch (0) { default:
      const nodeid = cookie && cookie.nodeid || req.query.nodeid;
      const rights = user && user._id && parent.GetNodeRights(user._id, webserver.wsagents[nodeid].dbMeshKey, nodeid);
      if (rights === 0xffffffff || (req.query.id && webserver.wsrelays[req.query.id]?.peer1)) { break; }
      if ((cookie?.tcpport) && cookie.tcpport !== getNoVncViewOnlyPort(nodeid, 0)) { return void ws.terminate(); }
    }
    return CreateMeshRelay.call(meshRelayHandler, parent, ws, req, domain, user, cookie);
  }

  return {
    server_startup: function () {
      webserver = meshserver.webserver;
      const { meshUserHandler, meshRelayHandler } = webserver;
      meshUserHandler.CreateMeshUser = _CreateMeshUser.bind(null, meshUserHandler.CreateMeshUser, meshUserHandler);
      meshRelayHandler.CreateMeshRelay = _CreateMeshRelay.bind(null, meshRelayHandler.CreateMeshRelay, meshRelayHandler);
    },
  };
};
