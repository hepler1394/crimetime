function studioPermission(origin, permission, details, studioURL) {
  try { if(new URL(origin).origin!==new URL(studioURL).origin)return false; } catch {return false;}
  if(permission==='fullscreen')return true;
  if(permission!=='media')return false;
  const types=details?.mediaTypes||(details?.mediaType?[details.mediaType]:[]);
  return types.length>0&&types.every(type=>type==='audio');
}
function configureStudioPermissions(session,studioURL){
  session.setPermissionRequestHandler((wc,permission,callback,details)=>callback(studioPermission(details?.requestingUrl||wc?.getURL()||'',permission,details,studioURL)));
  session.setPermissionCheckHandler((_wc,permission,origin,details)=>studioPermission(origin||'',permission,details,studioURL));
  session.setDevicePermissionHandler(()=>false);
}
module.exports={studioPermission,configureStudioPermissions};
