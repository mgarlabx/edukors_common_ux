// The app uses no camera, microphone or Bluetooth; Electron's Info.plist declares them anyway, so macOS
// would show them as permissions the app may ask for. Removed before signing.
const {execFileSync}=require('node:child_process'),path=require('node:path');
exports.default=async ctx=>{
  if(ctx.electronPlatformName!=='darwin')return;
  const plist=path.join(ctx.appOutDir,ctx.packager.appInfo.productFilename+'.app','Contents','Info.plist');
  for(const key of ['NSCameraUsageDescription','NSMicrophoneUsageDescription','NSAudioCaptureUsageDescription','NSBluetoothPeripheralUsageDescription','NSBluetoothAlwaysUsageDescription'])
    try{execFileSync('plutil',['-remove',key,plist],{stdio:'ignore'});}catch{}
};
