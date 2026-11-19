"""Voice-command grammar for Stem Studio -> phrases with Earlybird token ids (written to commands.json for the browser)."""
import json, sys
STEMS = {  # spoken word(s) -> stem kind in Stem Studio
    'vocals': 'vocals', 'vocal': 'vocals', 'voice': 'vocals', 'drums': 'drums', 'drum': 'drums', 'bass': 'bass',
    'other': 'other', 'guitar': 'guitar', 'piano': 'piano', 'keys': 'piano', 'lead vocal': 'lead', 'lead vocals': 'lead',
    'backing vocals': 'backing', 'kick': 'kick', 'snare': 'snare', 'hats': 'hats', 'hi hat': 'hats',
}
TEMPLATES = {
    'mute': ['mute {s}', 'mute the {s}', 'drop the {s}', 'kill the {s}', 'cut the {s}'],
    'unmute': ['unmute {s}', 'unmute the {s}', 'bring back the {s}', 'bring in the {s}'],
    'solo': ['solo {s}', 'solo the {s}', 'just the {s}'],
}
FIXED = {
    'play': ['play', 'start', 'resume'], 'pause': ['pause'], 'stop': ['stop'],
    'export': ['export', 'export stems', 'export the stems', 'render'],
    'unsolo': ['unsolo', 'unsolo all', 'clear solo'], 'unmute_all': ['unmute all', 'unmute everything'],
}
def phrases():
    out = []
    for action, ts in TEMPLATES.items():
        for word, stem in STEMS.items():
            for t in ts:
                out.append({'text': t.format(s=word), 'action': action, 'stem': stem})
    for action, ps in FIXED.items():
        for p in ps:
            out.append({'text': p, 'action': action, 'stem': None})
    return out
def forms(text):  # how Earlybird writes a short utterance: capitalised, with or without a full stop
    c = text[0].upper() + text[1:]
    return [c + '.', c]
if __name__ == '__main__':
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained('model')
    ph = phrases()
    for p in ph:
        p['forms'] = [tok(f, add_special_tokens=False)['input_ids'] for f in forms(p['text'])]
    vocab = tok.convert_ids_to_tokens(list(range(len(tok))))
    json.dump({'bos': 1, 'eos': 2, 'phrases': ph}, open(sys.argv[1] if len(sys.argv) > 1 else 'out/commands.json', 'w'))
    json.dump(vocab, open('out/vocab.json', 'w'), ensure_ascii=False)
    print(len(ph), 'phrases', len(vocab), 'tokens')
