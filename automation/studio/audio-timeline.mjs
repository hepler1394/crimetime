// Shared edit math: all cuts round to the project's sample grid.
export const sampleTime=(seconds,rate=48000)=>Math.round(seconds*rate)/rate;
export function validateTimeline(t){
 if(!t||!Array.isArray(t.tracks)||t.tracks.length>32)throw new Error('Use at most 32 audio tracks.');
 const rate=t.sampleRate||48000;if(![44100,48000].includes(rate))throw new Error('Choose 44.1 or 48 kHz.');
 for(const track of t.tracks){if(!Array.isArray(track.clips)||track.clips.length>200||typeof track.name!=='string')throw new Error('Invalid audio track.');if(!Number.isFinite(track.gain||0)||Math.abs(track.gain||0)>36)throw new Error('Track gain must be between -36 and 36 dB.');for(const c of track.clips){if(typeof c.asset!=='string'||![c.start,c.in,c.out,c.gain||0,c.fadeIn||0,c.fadeOut||0].every(Number.isFinite)||c.in<0||c.out<=c.in||c.start<0||c.start+c.out-c.in>14400||Math.abs(c.gain||0)>36||(c.fadeIn||0)<0||(c.fadeOut||0)<0)throw new Error('Invalid clip range, volume or fade.');}}
 return t;
}
export function splitClip(clip,at,rate=48000){const offset=sampleTime(at-clip.start,rate),length=sampleTime(clip.out-clip.in,rate);if(offset<=0||offset>=length)throw new Error('Place the playhead inside the selected clip.');return[{...clip,out:sampleTime(clip.in+offset,rate),fadeOut:0},{...clip,id:crypto.randomUUID(),start:sampleTime(clip.start+offset,rate),in:sampleTime(clip.in+offset,rate),fadeIn:0}];}
export function timelineDuration(t){return Math.max(0,...t.tracks.flatMap(t=>t.clips.map(c=>c.start+c.out-c.in)));}
export function captionText(segments,format='srt'){
 const stamp=(t)=>{const ms=Math.round(Math.max(0,t)*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${format==='vtt'?'.':','}${String(ms%1000).padStart(3,'0')}`;};
 let last=-1;for(const s of segments){if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<=s.start||s.start<last)throw new Error('Caption times must be ordered and have positive duration.');last=s.start;}
 return(format==='vtt'?'WEBVTT\n\n':'')+segments.map((s,i)=>`${format==='vtt'?'':i+1+'\n'}${stamp(s.start)} --> ${stamp(s.end)}\n${String(s.text).replace(/-->/g,'—>')}\n`).join('\n');
}
