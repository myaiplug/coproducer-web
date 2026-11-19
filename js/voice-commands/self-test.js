/** Phrases for voice-commands-test.html and how a result is judged. want = [action, stem] or null (must be rejected). */
export const SELF_TEST = [
  { say: 'drop the bass', want: ['mute', 'bass'] }, { say: 'mute vocals', want: ['mute', 'vocals'] }, { say: 'solo drums', want: ['solo', 'drums'] },
  { say: 'play', want: ['play', null] }, { say: 'stop', want: ['stop', null] }, { say: 'pause', want: ['pause', null] }, { say: 'export', want: ['export', null] },
  { say: 'unmute vocals', want: ['unmute', 'vocals'] }, { say: 'mute the drums', want: ['mute', 'drums'] }, { say: 'solo the bass', want: ['solo', 'bass'] },
  { say: 'bring back the bass', want: ['unmute', 'bass'] }, { say: 'unsolo', want: ['unsolo', null] }, { say: 'unmute all', want: ['unmute_all', null] },
  { say: 'mute the kick', want: ['mute', 'kick'] }, { say: 'solo the guitar', want: ['solo', 'guitar'] }, { say: 'mute the piano', want: ['mute', 'piano'] },
  { say: 'just the vocals', want: ['solo', 'vocals'] }, { say: 'kill the snare', want: ['mute', 'snare'] }, { say: 'mute the backing vocals', want: ['mute', 'backing'] },
  { say: 'what time is it', want: null }, { say: 'turn it up a bit', want: null }, { say: 'that sounds great', want: null },
  { say: 'the bass is too loud', want: null }, { say: '(cough, or just hold the button and stay silent)', want: null },
];
export function judge(t, cmd) {
  if (!t.want) return cmd ? { pass: false, why: `accepted as ${cmd.action}${cmd.stem ? ' ' + cmd.stem : ''}` } : { pass: true, why: '' };
  if (!cmd) return { pass: false, why: 'rejected' };
  const ok = cmd.action === t.want[0] && (cmd.stem ?? null) === t.want[1];
  return { pass: ok, why: ok ? '' : `got ${cmd.action}${cmd.stem ? ' ' + cmd.stem : ''}` };
}
