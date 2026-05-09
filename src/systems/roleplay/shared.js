const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const fs = require('fs');
const path = require('path');

/**
 * Roleplay Actions Command Pack
 *
 * Drop into:
 * commands/fun/roleplay.js
 *
 * Features:
 * - One command file, many aliases.
 * - Mention, user ID, username, display name, and fuzzy target matching.
 * - Better Tenor GIF matching with safer filtering.
 * - Footer shows Tenor GIF source when Tenor provides useful metadata.
 * - Uses message.channel.send to avoid blank embed bugs from custom respond helpers.
 * - Per-user cooldown.
 * - Built-in roleplaylist and rplist command.
 *
 * Optional env:
 * TENOR_API_KEY=your_tenor_key
 * ROLEPLAY_COOLDOWN_MS=2500
 * ROLEPLAY_ALLOW_BOTS=false
 */

const DEFAULT_COLOR = respond.DEFAULT_EMBED_COLOR;
const ERROR_COLOR = respond.ERROR_EMBED_COLOR;
const NL = String.fromCharCode(10);
const COOLDOWN_MS = Number(process.env.ROLEPLAY_COOLDOWN_MS || 2500);
const ALLOW_BOT_TARGETS = String(process.env.ROLEPLAY_ALLOW_BOTS || 'false').toLowerCase() === 'true';

const cooldowns = new Map();

const DATA_DIR = path.join(process.cwd(), 'data');
const BLOCK_FILE = path.join(DATA_DIR, 'roleplay-blocks.json');
let blockCache = null;

function makeAction(name, verb, noTarget, tone, gif, group) {
  return { name, verb, noTarget, tone, gif, group, color: DEFAULT_COLOR };
}

const ACTION_SPECS = [
  ['flirt', 'flirted with', 'dropped a playful flirty line', 'playful and flirty', 'anime flirt blush wink romantic cute', 'affection'],
  ['tease', 'teased', 'teased the room with a cheeky grin', 'cheeky', 'anime teasing smug funny', 'affection'],
  ['wink', 'winked at', 'gave a confident wink', 'confident', 'anime wink confident', 'affection'],
  ['blush', 'blushed at', 'blushed softly', 'bashful', 'anime blush shy cute', 'affection'],
  ['admire', 'admired', 'admired the moment warmly', 'warm', 'anime admire sparkle smile', 'affection'],
  ['charm', 'charmed', 'turned on the charm', 'stylish', 'anime charming smile sparkle', 'affection'],
  ['adore', 'adored', 'felt full of soft affection', 'soft', 'anime adore heart eyes cute', 'affection'],
  ['praise', 'praised', 'gave sincere praise', 'sincere', 'anime praise happy thumbs up', 'affection'],
  ['compliment', 'complimented', 'shared a lovely compliment', 'kind', 'anime compliment blush smile', 'affection'],
  ['cuddle', 'cuddled', 'wrapped themselves in cozy vibes', 'cozy', 'anime cuddle wholesome cozy', 'cozy'],
  ['snuggle', 'snuggled with', 'snuggled into a cozy mood', 'soft and cozy', 'anime snuggle cozy', 'cozy'],
  ['nuzzle', 'nuzzled', 'nuzzled the air cutely', 'cute', 'anime nuzzle cute', 'cute'],
  ['embrace', 'embraced', 'gave a gentle embrace to the moment', 'gentle', 'anime embrace hug wholesome', 'cozy'],
  ['cradle', 'cradled', 'held the moment protectively', 'protective', 'anime comfort hug protective', 'cozy'],
  ['caress', 'softly comforted', 'sent a soft affectionate gesture', 'soft', 'anime gentle touch comfort', 'cozy'],
  ['hold', 'held', 'held onto a cozy feeling', 'warm', 'anime hold hands wholesome', 'cozy'],
  ['leanon', 'leaned on', 'leaned into the cozy silence', 'affectionate', 'anime lean on shoulder', 'cozy'],
  ['twirl', 'twirled', 'twirled playfully', 'playful', 'anime twirl dance', 'affection'],
  ['smooch', 'gave a sweet smooch to', 'sent a sweet smooch into the air', 'sweet', 'anime kiss cute wholesome', 'affection'],
  ['kiss', 'kissed', 'sent a soft kiss into the air', 'sweet', 'anime kiss cute wholesome', 'affection'],
  ['peck', 'gave a quick peck to', 'sent a quick peck', 'sweet', 'anime cheek kiss cute wholesome', 'affection'],
  ['foreheadkiss', 'gave a gentle forehead kiss to', 'sent a gentle forehead kiss', 'gentle', 'anime forehead kiss wholesome', 'affection'],
  ['cheekkiss', 'gave a cheek kiss to', 'sent a cheek kiss', 'sweet', 'anime cheek kiss wholesome', 'affection'],
  ['handkiss', 'gave a classy hand kiss to', 'offered a classy hand kiss', 'classy', 'anime hand kiss gentleman', 'affection'],
  ['noseboop', 'booped the nose of', 'booped the air', 'cute', 'anime nose boop cute', 'cute'],
  ['headrest', 'rested their head on', 'rested their head softly', 'soft', 'anime head on shoulder', 'cozy'],
  ['hug', 'hugged', 'gave a warm hug to the room', 'comforting', 'anime hug wholesome', 'cozy'],
  ['hugback', 'hugged back', 'returned the hug warmly', 'warm', 'anime hug back wholesome', 'cozy'],
  ['squeeze', 'gave a tight squeeze to', 'squeezed a pillow tightly', 'affectionate', 'anime tight hug', 'cozy'],
  ['melt', 'melted into affection for', 'melted dramatically from affection', 'dramatic', 'anime melt blush', 'affection'],
  ['swoon', 'swooned over', 'swooned dramatically', 'dramatic', 'anime swoon blush', 'affection'],
  ['giggle', 'giggled at', 'giggled softly', 'playful', 'anime giggle cute', 'reaction'],
  ['bliss', 'felt pure bliss with', 'radiated pure bliss', 'happy', 'anime happy bliss', 'affection'],
  ['devotion', 'showed loyal devotion to', 'stood with loyal devotion', 'loyal', 'anime devotion loyal', 'affection'],
  ['cherish', 'cherished', 'cherished the moment warmly', 'warm', 'anime cherish warm smile', 'affection'],
  ['treasure', 'treasured', 'held the moment like a treasure', 'precious', 'anime precious treasure smile', 'affection'],
  ['spark', 'sparked romantic energy with', 'added sparkly romantic energy', 'sparkly', 'anime sparkle love', 'affection'],
  ['glow', 'glowed warmly at', 'glowed with warm energy', 'warm', 'anime glow warm happy', 'affection'],
  ['radiate', 'radiated sweetness toward', 'radiated sweetness and confidence', 'sweet', 'anime radiate happiness', 'affection'],
  ['flutter', 'felt heart flutters around', 'felt their heart flutter', 'romantic', 'anime heart flutter blush', 'affection'],
  ['bashful', 'got bashful around', 'got shy and bashful', 'shy', 'anime shy blush cute', 'affection'],
  ['smirk', 'smirked at', 'gave a sly smirk', 'sly', 'anime smirk smug', 'reaction'],
  ['grin', 'grinned at', 'gave a bright grin', 'bright', 'anime grin happy', 'reaction'],
  ['stare', 'stared dramatically at', 'stared dramatically into space', 'dramatic', 'anime stare dramatic funny', 'reaction'],
  ['gaze', 'gave a soft lingering gaze to', 'gazed softly into the distance', 'soft', 'anime soft gaze', 'affection'],
  ['dream', 'dreamed softly about', 'looked dreamy and dazed', 'dreamy', 'anime dreamy dazed', 'affection'],
  ['melody', 'sent a soft melody to', 'hummed a soft poetic melody', 'poetic', 'anime music love', 'affection'],
  ['poem', 'wrote a tiny poem for', 'created a tiny romantic line', 'poetic', 'anime poem writing love', 'affection'],
  ['loveletter', 'wrote a tiny love letter to', 'wrote a tiny love note', 'romantic', 'anime love letter', 'affection'],
  ['rose', 'offered a rose to', 'offered a rose to the room', 'romantic', 'anime rose romantic', 'affection'],
  ['flower', 'offered flowers to', 'offered flowers with a sweet smile', 'sweet', 'anime flowers cute', 'affection'],
  ['gift', 'gave a thoughtful gift to', 'prepared a tiny thoughtful gift', 'thoughtful', 'anime gift present', 'affection'],
  ['candy', 'offered candy to', 'offered a sweet treat', 'sweet', 'anime candy sweet', 'affection'],
  ['coffee', 'offered coffee or tea to', 'made a cozy coffee or tea moment', 'cozy', 'anime coffee tea cozy', 'cozy'],
  ['blanket', 'wrapped a cozy blanket around', 'wrapped themselves in a cozy blanket', 'cozy', 'anime blanket cozy', 'cozy'],
  ['shield', 'shielded', 'raised a warm protective shield', 'protective', 'anime protect shield', 'cozy'],
  ['comfort', 'comforted', 'sent gentle comfort', 'gentle', 'anime comfort hug sad', 'cozy'],
  ['support', 'supported', 'gave reassuring support', 'reassuring', 'anime support encouragement', 'cozy'],
  ['encourage', 'encouraged', 'boosted everyone with confidence', 'motivating', 'anime encouragement thumbs up', 'cozy'],
  ['purr', 'purred softly at', 'purred softly with cozy vibes', 'cozy', 'anime cat purr cozy', 'cute'],
  ['meow', 'meowed playfully at', 'meowed playfully', 'playful', 'anime cat meow cute', 'cute'],
  ['lick', 'gave a playful lick to', 'made a teasing playful lick gesture', 'playful', 'anime lick cheek cute', 'cute'],
  ['nibble', 'gave a light playful nibble to', 'nibbled playfully on a snack', 'playful', 'anime nibble cute', 'cute'],
  ['bark', 'barked playfully at', 'barked playfully', 'playful', 'anime dog bark funny', 'cute'],
  ['howl', 'howled dramatically at', 'howled dramatically', 'dramatic', 'anime howl dramatic', 'cute'],
  ['growl', 'growled playfully at', 'gave a mock playful growl', 'playful', 'anime growl funny', 'cute'],
  ['hiss', 'hissed sassily at', 'let out a sassy hiss', 'sassy', 'anime hiss sassy', 'cute'],
  ['wag', 'wagged happily at', 'wagged happily', 'happy', 'anime tail wag happy', 'cute'],
  ['chirp', 'chirped excitedly at', 'chirped excitedly', 'excited', 'anime chirp excited', 'cute'],
  ['squeak', 'squeaked at', 'made a tiny squeak', 'tiny', 'anime squeak cute', 'cute'],
  ['bounce', 'bounced around', 'bounced around with energy', 'energetic', 'anime bounce excited', 'cute'],
  ['zoom', 'zoomed around', 'got chaotic zoomies', 'chaotic', 'anime zoomies funny', 'cute'],
  ['sleep', 'fell asleep beside', 'fell asleep cozily', 'sleepy', 'anime sleep cozy', 'cozy'],
  ['yawn', 'yawned sleepily at', 'let out a sleepy yawn', 'sleepy', 'anime yawn', 'cozy'],
  ['stretch', 'stretched beside', 'stretched lazily', 'relaxed', 'anime stretch relaxed', 'cozy'],
  ['sit', 'sat calmly beside', 'sat calmly', 'calm', 'anime sit calm', 'cozy'],
  ['rollover', 'rolled over for', 'rolled over playfully', 'playful', 'anime roll over funny', 'cute'],
  ['beg', 'begged cutely at', 'begged in a cute playful way', 'cute', 'anime beg cute', 'cute'],
  ['hidebehind', 'hid behind', 'hid behind nothing dramatically', 'playful', 'anime hide behind', 'reaction'],
  ['peek', 'peeked at', 'peeked out from hiding', 'curious', 'anime peek cute', 'reaction'],
  ['glomp', 'glomped', 'glomped the air energetically', 'energetic', 'anime glomp hug', 'cozy'],
  ['cling', 'clung to', 'clung affectionately to the moment', 'affectionate', 'anime cling hug', 'cozy'],
  ['follow', 'followed', 'started following the vibe around', 'playful', 'anime follow', 'reaction'],
  ['panic', 'panicked around', 'panicked chaotically', 'chaotic', 'anime panic funny', 'reaction'],
  ['scream', 'screamed dramatically at', 'screamed dramatically', 'dramatic', 'anime scream funny', 'reaction'],
  ['whisper', 'whispered to', 'whispered quietly', 'quiet', 'anime whisper', 'reaction'],
  ['shout', 'shouted at', 'shouted dramatically', 'loud', 'anime shout funny', 'reaction'],
  ['chant', 'chanted at', 'started chanting rhythmically', 'rhythmic', 'anime chant', 'reaction'],
  ['bow', 'bowed respectfully to', 'bowed respectfully', 'respectful', 'anime bow', 'reaction'],
  ['curtsy', 'curtsied politely to', 'gave a polite curtsy', 'polite', 'anime curtsy', 'reaction'],
  ['salute', 'saluted', 'gave a sharp salute', 'respectful', 'anime salute', 'reaction'],
  ['nod', 'nodded at', 'nodded in agreement', 'agreeable', 'anime nod yes', 'reaction'],
  ['shrug', 'shrugged at', 'shrugged casually', 'casual', 'anime shrug', 'reaction'],
  ['tilthead', 'tilted their head at', 'tilted their head curiously', 'curious', 'anime head tilt confused', 'reaction'],
  ['confused', 'looked confused at', 'looked confused', 'confused', 'anime confused', 'reaction'],
  ['think', 'thought deeply about', 'started thinking deeply', 'thoughtful', 'anime thinking', 'reaction'],
  ['idea', 'had an idea about', 'had a lightbulb moment', 'bright', 'anime idea lightbulb', 'reaction'],
  ['facepalm', 'facepalmed at', 'facepalmed softly', 'done', 'anime facepalm', 'reaction'],
  ['facepalmhard', 'facepalmed hard at', 'facepalmed extremely hard', 'exaggerated', 'anime facepalm hard', 'reaction'],
  ['eyeroll', 'rolled their eyes at', 'rolled their eyes dramatically', 'sassy', 'anime eye roll', 'reaction'],
  ['laugh', 'laughed with', 'laughed brightly', 'happy', 'anime laugh funny', 'reaction'],
  ['snort', 'snorted laughing at', 'snorted from laughter', 'funny', 'anime snort laugh', 'reaction'],
  ['laughhard', 'laughed hard with', 'laughed way too hard', 'intense', 'anime laughing hard funny', 'reaction'],
  ['cry', 'cried with', 'started crying', 'emotional', 'anime cry sad', 'reaction'],
  ['sob', 'sobbed with', 'sobbed dramatically', 'heavy', 'anime sob crying', 'reaction'],
  ['tearup', 'teared up around', 'teared up quietly', 'soft', 'anime tear up emotional', 'reaction'],
  ['blowkiss', 'blew a kiss to', 'blew a kiss into the air', 'sweet', 'anime blow kiss cute', 'affection'],
  ['shadow', 'hid in the shadows from', 'hid in the shadows', 'mysterious', 'anime shadow mysterious', 'drama'],
  ['vanish', 'vanished away from', 'vanished dramatically', 'dramatic', 'anime vanish', 'drama'],
  ['appear', 'appeared suddenly near', 'appeared suddenly', 'sudden', 'anime appear suddenly', 'drama'],
  ['teleport', 'teleported to', 'teleported dramatically', 'dramatic', 'anime teleport', 'drama'],
  ['summon', 'summoned', 'summoned mysterious energy', 'dramatic', 'anime summon magic', 'drama'],
  ['banish', 'banished', 'banished bad vibes playfully', 'playful', 'anime banish magic', 'drama'],
  ['freeze', 'froze in place near', 'froze in place dramatically', 'dramatic', 'anime freeze', 'drama'],
  ['explode', 'exploded cartoonishly near', 'exploded in a fake cartoon blast', 'cartoon', 'anime explosion funny', 'drama'],
  ['revive', 'revived', 'revived from the drama', 'heroic', 'anime revive heal', 'drama'],
  ['charge', 'charged toward', 'charged forward dramatically', 'dramatic', 'anime charge attack', 'cartoon'],
  ['retreat', 'retreated from', 'retreated dramatically', 'dramatic', 'anime retreat', 'cartoon'],
  ['bonk', 'bonked', 'bonked the air cartoonishly', 'cartoon', 'anime bonk funny', 'cartoon'],
  ['bonksoft', 'soft-bonked', 'gave a tiny soft bonk', 'soft', 'anime bonk cute funny', 'cartoon'],
  ['slapstick', 'hit with slapstick comedy', 'performed a slapstick gag', 'cartoon', 'anime slapstick funny', 'cartoon'],
  ['poke', 'poked', 'poked the air playfully', 'playful', 'anime poke cute', 'cute'],
  ['pat', 'patted', 'gave a gentle pat', 'gentle', 'anime pat head wholesome', 'cute'],
  ['headpat', 'gave a comforting head pat to', 'gave a comforting head pat to the room', 'comforting', 'anime headpat wholesome', 'cute'],
  ['tap', 'tapped', 'tapped lightly', 'light', 'anime tap shoulder', 'cartoon'],
  ['jab', 'gave a silly jab to', 'jabbed the air jokingly', 'silly', 'anime jab funny', 'cartoon'],
  ['thump', 'thumped', 'made a goofy thump', 'goofy', 'anime thump funny', 'cartoon'],
  ['whap', 'whapped', 'delivered a cartoon whap', 'cartoon', 'anime whap slapstick', 'cartoon'],
  ['smack', 'smacked cartoonishly', 'gave a slapstick smack', 'cartoon', 'anime smack funny', 'cartoon'],
  ['whack', 'whacked goofily', 'gave a goofy whack', 'goofy', 'anime whack funny', 'cartoon'],
  ['bonkhammer', 'bonked with an oversized hammer', 'swung an oversized bonk hammer', 'cartoon', 'anime hammer bonk', 'cartoon'],
  ['slam', 'slammed dramatically near', 'made a dramatic cartoon slam', 'dramatic', 'anime slam funny', 'cartoon'],
  ['boom', 'boomed dramatically near', 'created a comic boom effect', 'comic', 'anime boom explosion', 'cartoon'],
  ['pow', 'powed dramatically at', 'made a comic-book POW effect', 'comic', 'anime pow punch funny', 'cartoon'],
  ['zap', 'zapped', 'zapped the air with funny energy', 'electric', 'anime zap electric funny', 'cartoon'],
  ['sparkhit', 'spark-hit', 'created a harmless spark jolt', 'electric', 'anime electric shock funny', 'cartoon'],
  ['launch', 'launched', 'launched into chaos', 'comic', 'anime launch funny', 'cartoon'],
  ['yeet', 'yeeted', 'yeeted the vibes away', 'goofy', 'anime yeet funny', 'cartoon'],
  ['toss', 'tossed a harmless prop at', 'tossed a harmless prop', 'goofy', 'anime toss funny', 'cartoon'],
  ['throw', 'threw a pillow at', 'threw a pillow into the void', 'playful', 'anime pillow throw', 'cartoon'],
  ['flip', 'flipped dramatically around', 'flipped dramatically', 'dramatic', 'anime flip', 'drama'],
  ['spin', 'spun', 'spun around dramatically', 'playful', 'anime spin funny', 'drama'],
  ['swing', 'swung cartoonishly at', 'swung in a cartoon arc', 'cartoon', 'anime swing attack', 'cartoon'],
  ['smash', 'smashed with comic impact near', 'made a comic smash impact', 'comic', 'anime smash funny', 'cartoon'],
  ['bash', 'bashed playfully at', 'bashed playfully into chaos', 'playful', 'anime bash funny', 'cartoon'],
  ['clapback', 'clapped back at', 'sent a witty clapback', 'witty', 'anime smug comeback', 'cartoon'],
  ['counter', 'countered', 'countered dramatically', 'dramatic', 'anime counter attack', 'cartoon'],
  ['dodge', 'dodged', 'dodged dramatically', 'dramatic', 'anime dodge', 'cartoon'],
  ['parry', 'parried', 'parried comically', 'dramatic', 'anime parry', 'cartoon'],
  ['block', 'blocked', 'blocked the hit dramatically', 'defensive', 'anime block attack', 'cartoon'],
  ['rush', 'rushed toward', 'rushed forward in a cartoon burst', 'fast', 'anime rush attack', 'cartoon'],
  ['pounce', 'pounced playfully on', 'pounced playfully', 'playful', 'anime pounce hug', 'cute'],
  ['lunge', 'lunged dramatically at', 'lunged dramatically', 'dramatic', 'anime lunge', 'cartoon'],
  ['grab', 'grabbed in a gag way', 'grabbed the air dramatically', 'goofy', 'anime grab funny', 'cartoon'],
  ['triplebonk', 'triple-bonked', 'performed three bonks in a row', 'cartoon', 'anime bonk funny', 'cartoon'],
  ['combo', 'performed a cartoon combo on', 'performed a cartoon combo', 'comic', 'anime combo attack', 'cartoon'],
  ['smite', 'smote', 'sent a magical comic strike', 'magical', 'anime smite magic', 'cartoon'],
  ['curse', 'cast a silly curse on', 'cast a silly harmless curse', 'magical', 'anime curse magic funny', 'cartoon'],
  ['hex', 'hexed', 'hexed the vibes for fun', 'magical', 'anime hex magic', 'cartoon'],
  ['jinx', 'jinxed', 'jinxed the moment playfully', 'playful', 'anime jinx funny', 'cartoon'],
  ['snare', 'snared in a goofy trap', 'set a goofy snare', 'goofy', 'anime trap funny', 'cartoon'],
  ['bind', 'bound in a harmless gag', 'made a harmless bind gag', 'goofy', 'anime bind magic', 'cartoon'],
  ['freezeray', 'froze with a fake ray', 'fired a fake freeze ray', 'cartoon', 'anime freeze ray', 'cartoon'],
  ['stun', 'stunned theatrically', 'stunned the room theatrically', 'theatrical', 'anime stun funny', 'cartoon'],
  ['knockback', 'knocked back comically', 'caused a comic knockback', 'comic', 'anime knockback funny', 'cartoon'],
  ['rage', 'raged dramatically at', 'entered fake rage mode', 'dramatic', 'anime rage funny', 'drama'],
  ['fury', 'entered cartoon fury against', 'entered cartoon fury mode', 'cartoon', 'anime fury rage', 'drama'],
  ['duel', 'challenged to a dramatic duel', 'started a dramatic duel stance', 'dramatic', 'anime duel', 'cartoon'],
  ['spar', 'started a light spar with', 'started light sparring practice', 'sporty', 'anime spar fight', 'cartoon'],
  ['battle', 'started a cartoon battle with', 'started a cartoon battle', 'cartoon', 'anime battle funny', 'cartoon'],
  ['challenge', 'challenged', 'issued a dramatic challenge', 'bold', 'anime challenge', 'cartoon'],
  ['victory', 'celebrated victory with', 'celebrated a victory', 'victorious', 'anime victory happy', 'drama'],
  ['defeat', 'accepted defeat before', 'reacted to defeat dramatically', 'dramatic', 'anime defeat sad funny', 'drama'],
  ['heal', 'healed', 'cast a comic heal', 'healing', 'anime healing magic', 'cozy'],
  ['repair', 'repaired', 'repaired the roleplay damage', 'helpful', 'anime repair fix', 'cartoon'],
  ['reset', 'reset the action state with', 'reset the action state', 'clean', 'anime reset', 'cartoon'],
  ['escape', 'escaped from', 'escaped dramatically', 'dramatic', 'anime escape run', 'cartoon'],
  ['pursue', 'pursued', 'gave chase playfully', 'playful', 'anime chase funny', 'cartoon'],
  ['ambush', 'ambushed with a surprise gag', 'set up a surprise ambush gag', 'surprise', 'anime ambush surprise', 'cartoon'],
  ['guard', 'guarded', 'stood guard proudly', 'protective', 'anime guard protect', 'cartoon'],
  ['protect', 'protected', 'protected the room with style', 'protective', 'anime protect shield', 'cozy'],
  ['taunt', 'taunted', 'sent a teasing combat taunt', 'teasing', 'anime taunt smug', 'cartoon'],
  ['heckle', 'heckled playfully at', 'heckled with playful rivalry', 'rivalry', 'anime heckle smug funny', 'cartoon'],
  ['snipe', 'sniped dramatically at', 'landed a dramatic harmless snipe', 'dramatic', 'anime snipe funny', 'cartoon'],
  ['strike', 'struck dramatically at', 'struck with stylized energy', 'dramatic', 'anime strike attack', 'cartoon'],
  ['glance', 'gave a dramatic side glance to', 'gave a dramatic side glance', 'dramatic', 'anime side glance', 'reaction'],
  ['wiggle', 'wiggled chaotically at', 'wiggled with chaotic energy', 'chaotic', 'anime wiggle funny', 'reaction'],
  ['twist', 'twisted into a dramatic pose near', 'twisted into a dramatic pose', 'dramatic', 'anime pose twist', 'drama'],
  ['pose', 'posed dramatically for', 'struck a dramatic pose', 'dramatic', 'anime pose dramatic', 'drama'],
  ['strut', 'strutted confidently past', 'strutted confidently', 'confident', 'anime strut confident', 'drama'],
  ['dance', 'danced with', 'performed a playful dance', 'playful', 'anime dance happy', 'drama'],
  ['spinout', 'spun out dramatically around', 'spun out dramatically', 'dramatic', 'anime spin out funny', 'drama'],
  ['shoot', 'shot a burst of confetti at', 'shot finger-gun confetti into the air', 'playful', 'anime finger gun confetti funny', 'cartoon'],
  ['paddlesmack', 'gave a cartoon paddle-smack to', 'swung a harmless cartoon paddle-smack', 'cartoon', 'anime slapstick paddle funny', 'cartoon']
];

const ROLEPLAY_ACTIONS = Object.fromEntries(ACTION_SPECS.map((spec) => [spec[0], makeAction(...spec)]));

const SELF_LINES = {
  flirt: 'flirted with themselves in the mirror'
};

const EXTRA_LINES = {
  flirt: ['Careful, that confidence might become contagious.', 'That was smooth enough to deserve background music.', 'The room just got slightly warmer.'],
  compliment: ['That compliment came wrapped in kindness.', 'A small reminder that someone noticed the good in you.', 'That was sweet, simple, and dangerously wholesome.'],
  praise: ['Credit where credit is due. That was deserved.', 'A little praise can carry someone further than we think.', 'That was genuine and well-earned.'],
  comfort: ['Breathe slowly. You are not carrying this alone.', 'Soft reminder: you are allowed to rest.', 'One gentle moment at a time.'],
  encourage: ['You have more strength than this moment is letting you see.', 'Keep going. Even small steps count.', 'You are closer than you think.'],
  poem: ['A tiny line of warmth, folded into the moment.', 'Soft words, small spark, big feeling.', 'Some moments deserve to be written gently.'],
  loveletter: ['A small note, but the feeling is loud.', 'Sealed with warmth and a little bit of courage.', 'Tiny letter. Big affection.']
};

const BLOCKED_ACTIONS = {
  fuck: 'Explicit sexual roleplay commands are not supported, especially when targeting another user.',
  sex: 'Explicit sexual roleplay commands are not supported, especially when targeting another user.',
  bang: 'Explicit sexual roleplay commands are not supported, especially when targeting another user.',
  hump: 'Explicit sexual roleplay commands are not supported, especially when targeting another user.',
  grope: 'Explicit sexual roleplay commands are not supported, especially when targeting another user.',
  fondle: 'Explicit sexual roleplay commands are not supported, especially when targeting another user.',
  strip: 'Explicit sexual roleplay commands are not supported, especially when targeting another user.',
  breed: 'Explicit sexual roleplay commands are not supported, especially when targeting another user.',
  spank: 'Sexualized targeting commands are not supported. Try paddlesmack for a non-sexual cartoon gag instead.'
};

const ACTION_NAMES = Object.keys(ROLEPLAY_ACTIONS);
const BLOCKED_NAMES = Object.keys(BLOCKED_ACTIONS);
const BAD_GIF_WORDS = ['nsfw', 'explicit', 'hentai', 'ecchi', 'nude', 'sex', 'porn', 'boob', 'twerk', 'strip', 'grope', 'fuck'];
const GROUP_COLORS = {
  affection: 0xff85c2,
  cozy: 0x8db5ff,
  cute: 0xf9a8d4,
  reaction: 0x8dd3ff,
  drama: 0xc4a1ff,
  cartoon: 0xffb86b
};
const SAFE_ACTIONS = new Set([
  'admire',
  'appreciate',
  'ask',
  'bashful',
  'bliss',
  'blush',
  'bonk',
  'bonksoft',
  'bounce',
  'bow',
  'challenge',
  'chant',
  'cherish',
  'chirp',
  'clapback',
  'comfort',
  'compliment',
  'confused',
  'coffee',
  'cry',
  'curtsy',
  'dance',
  'encourage',
  'eyeroll',
  'facepalm',
  'facepalmhard',
  'flower',
  'gift',
  'giggle',
  'glance',
  'glow',
  'grin',
  'guard',
  'headpat',
  'heal',
  'heckle',
  'hidebehind',
  'hug',
  'hugback',
  'idea',
  'kiss',
  'laugh',
  'laughhard',
  'leanon',
  'meow',
  'melody',
  'nod',
  'noseboop',
  'pat',
  'patback',
  'peek',
  'poem',
  'praise',
  'protect',
  'purr',
  'radiate',
  'rose',
  'salute',
  'sit',
  'sleep',
  'smirk',
  'snort',
  'snuggle',
  'spark',
  'squeak',
  'stare',
  'stretch',
  'support',
  'tea',
  'think',
  'tilthead',
  'treasure',
  'twirl',
  'wag',
  'whisper',
  'wiggle',
  'wink',
  'yawn'
]);

function loadBlockData() {
  if (blockCache) return blockCache;

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(BLOCK_FILE)) fs.writeFileSync(BLOCK_FILE, JSON.stringify({ guilds: {} }, null, 2));
    blockCache = JSON.parse(fs.readFileSync(BLOCK_FILE, 'utf8'));
  } catch {
    blockCache = { guilds: {} };
  }

  if (!blockCache.guilds) blockCache.guilds = {};
  return blockCache;
}

function saveBlockData() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BLOCK_FILE, JSON.stringify(blockCache || { guilds: {} }, null, 2));
  } catch {
    return false;
  }
  return true;
}

function getGuildBlockSet(guildId) {
  const data = loadBlockData();
  if (!data.guilds[guildId]) data.guilds[guildId] = [];
  return new Set(data.guilds[guildId]);
}

function setGuildBlockSet(guildId, set) {
  const data = loadBlockData();
  data.guilds[guildId] = [...set].sort();
  saveBlockData();
}

function isStaff(message) {
  if (!message.guild || !message.member) return false;
  const perms = message.member.permissions;
  return perms.has('Administrator') || perms.has('ManageGuild') || perms.has('ModerateMembers') || perms.has('ManageMessages');
}

function getActionGroups() {
  const groups = {};
  for (const actionData of Object.values(ROLEPLAY_ACTIONS)) {
    if (!groups[actionData.group]) groups[actionData.group] = [];
    groups[actionData.group].push(actionData.name);
  }
  return groups;
}

function parseBlockTargets(args = []) {
  const raw = args.join(' ').toLowerCase().replaceAll(',', ' ');
  const tokens = words(raw);
  const groups = getActionGroups();
  const targets = new Set();

  for (const token of tokens) {
    if (token === 'all') {
      for (const name of ACTION_NAMES) targets.add(name);
      for (const name of BLOCKED_NAMES) targets.add(name);
      continue;
    }

    if (groups[token]) {
      for (const name of groups[token]) targets.add(name);
      continue;
    }

    if (ROLEPLAY_ACTIONS[token] || BLOCKED_ACTIONS[token]) {
      targets.add(token);
    }
  }

  return [...targets];
}

function isRoleplayBlocked(message, commandName) {
  if (!message.guild) return false;
  const blocked = getGuildBlockSet(message.guild.id);
  return blocked.has(commandName) || blocked.has('all');
}

function sendStyled(message, type, payload) {
  return message.channel.send(respond.stylePayload(type, message.author, payload, { message }));
}

async function sendModOnly(message) {
  return sendStyled(message, 'bad', {
    embeds: [{
      title: 'Staff Only',
      description: 'You need Manage Server, Moderate Members, Manage Messages, or Administrator permission to change roleplay settings.',
      color: ERROR_COLOR
    }],
    allowedMentions: { users: [], roles: [], repliedUser: false }
  });
}

async function handleRoleplayBlock(message, args, shouldBlock) {
  if (!message.guild) return respond.reply(message, 'bad', 'Roleplay settings can only be changed inside a server.');
  if (!isStaff(message)) return sendModOnly(message);

  const targets = parseBlockTargets(args);
  if (!targets.length) {
    return sendStyled(message, 'bad', {
      embeds: [{
        title: shouldBlock ? 'Block Roleplay Commands' : 'Unblock Roleplay Commands',
        description: [
          'Provide one or more command names, categories, or `all`.',
          '',
          'Examples:',
          '`roleplayblock flirt hug bonk`',
          '`roleplayblock affection`',
          '`roleplayunblock hug`',
          '`roleplayunblock all`'
        ].join(NL),
        color: ERROR_COLOR
      }]
    });
  }

  const blocked = getGuildBlockSet(message.guild.id);
  for (const target of targets) {
    if (shouldBlock) blocked.add(target);
    else blocked.delete(target);
  }
  setGuildBlockSet(message.guild.id, blocked);

  return sendStyled(message, 'good', {
      embeds: [{
        title: shouldBlock ? 'Roleplay Commands Blocked' : 'Roleplay Commands Unblocked',
        description: targets.map((name) => `\`${name}\``).join(', '),
        color: respond.DEFAULT_EMBED_COLOR,
        footer: { text: `${blocked.size} roleplay command(s) currently blocked in this server` }
      }]
    });
}

async function handleRoleplayBlockedList(message) {
  if (!message.guild) return respond.reply(message, 'bad', 'Roleplay settings can only be viewed inside a server.');
  const blocked = [...getGuildBlockSet(message.guild.id)].sort();

  return sendStyled(message, 'info', {
    embeds: [{
      title: 'Blocked Roleplay Commands',
      description: blocked.length ? blocked.map((name) => `\`${name}\``).join(', ') : 'No roleplay commands are blocked in this server.',
      color: respond.DEFAULT_EMBED_COLOR,
      footer: { text: 'Moderators can use roleplayblock and roleplayunblock.' }
    }]
  });
}


const FALLBACK_GIFS = {
  hug: ['https://media.tenor.com/7o9VvR5GZpsAAAAC/anime-hug.gif', 'https://media.tenor.com/8TnYpJpLQ8sAAAAC/anime-hug.gif'],
  kiss: ['https://media.tenor.com/F02Ep3b2jJgAAAAC/cute-kawai.gif'],
  blush: ['https://media.tenor.com/RG1Z76QxA2sAAAAC/anime-blush.gif'],
  laugh: ['https://media.tenor.com/7VvCkJxY3WQAAAAC/anime-laugh.gif'],
  cry: ['https://media.tenor.com/9tZ4Xv9VZVwAAAAC/anime-cry.gif'],
  pat: ['https://media.tenor.com/1r8S4U4JdJUAAAAC/anime-pat.gif'],
  bonk: ['https://media.tenor.com/qfA8rH15qJMAAAAC/bonk-doge.gif'],
  default: ['https://media.tenor.com/7o9VvR5GZpsAAAAC/anime-hug.gif', 'https://media.tenor.com/0T0vTtYv9xAAAAAC/anime-smile.gif', 'https://media.tenor.com/RG1Z76QxA2sAAAAC/anime-blush.gif']
};

function pickRandom(list = []) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function words(value = '') {
  return String(value || '').split(' ').map((word) => word.trim()).filter(Boolean);
}

function onlyDigits(value = '') {
  let out = '';
  for (const char of String(value || '')) {
    if (char >= '0' && char <= '9') out += char;
  }
  return out;
}

function normalizeText(value = '') {
  let out = '';
  for (const char of String(value || '').toLowerCase()) {
    const code = char.charCodeAt(0);
    const isLetter = code >= 97 && code <= 122;
    const isNumber = code >= 48 && code <= 57;
    const isSpace = char === ' ' || char === String.fromCharCode(9) || char === String.fromCharCode(10) || char === String.fromCharCode(13);
    const isAllowed = char === '.' || char === '_' || char === '-';
    if (isLetter || isNumber || isSpace || isAllowed) out += isSpace ? ' ' : char;
  }
  return words(out).join(' ');
}

function singleLine(value = '') {
  return words(String(value || '').replaceAll(String.fromCharCode(9), ' ').replaceAll(String.fromCharCode(10), ' ').replaceAll(String.fromCharCode(13), ' ')).join(' ');
}

function getUsedCommandName(message) {
  const firstToken = words(String(message.content || '').trim())[0] || '';
  let command = firstToken;
  while (command.length && !isAlphaNumeric(command[0])) command = command.slice(1);
  return command.toLowerCase();
}

function isAlphaNumeric(char) {
  const code = String(char || '').charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function trimTargetQuery(args = []) {
  return args.filter((token) => !(String(token).startsWith('<@') && String(token).endsWith('>'))).join(' ').trim();
}

function checkCooldown(userId) {
  if (!COOLDOWN_MS || COOLDOWN_MS <= 0) return 0;
  const now = Date.now();
  const last = cooldowns.get(userId) || 0;
  const remaining = COOLDOWN_MS - (now - last);
  if (remaining > 0) return remaining;
  cooldowns.set(userId, now);
  return 0;
}

async function fetchMemberById(guild, id) {
  if (!guild || !id) return null;
  const cached = guild.members.cache.get(id);
  if (cached) return cached;
  return guild.members.fetch(id).catch(() => null);
}

async function findMemberByText(message, args = []) {
  const guild = message.guild;
  if (!guild) return null;

  const mentioned = message.mentions?.members?.first();
  if (mentioned && (ALLOW_BOT_TARGETS || !mentioned.user.bot)) return mentioned;

  const raw = trimTargetQuery(args);
  if (!raw) return null;

  for (const token of words(raw)) {
    const id = onlyDigits(token);
    if (id.length >= 15 && id.length <= 25) {
      const byId = await fetchMemberById(guild, id);
      if (byId && (ALLOW_BOT_TARGETS || !byId.user.bot)) return byId;
    }
  }

  const query = normalizeText(raw);
  if (!query) return null;

  let members = guild.members.cache;
  if (members.size < Math.min(guild.memberCount || 100, 100)) {
    await guild.members.fetch({ query: raw.slice(0, 32), limit: 10 }).catch(() => null);
    members = guild.members.cache;
  }

  const queryWords = words(query);
  const candidates = members
    .filter((member) => ALLOW_BOT_TARGETS || !member.user.bot)
    .map((member) => {
      const names = [member.user.username, member.displayName, member.user.globalName, member.user.tag].map(normalizeText).filter(Boolean);
      let score = 0;
      for (const name of names) {
        if (name === query) score += 120;
        else if (name.startsWith(query)) score += 85;
        else if (name.includes(query)) score += 55;
        const nameWords = words(name);
        for (const word of queryWords) {
          if (nameWords.includes(word)) score += 12;
          else if (name.includes(word)) score += 6;
        }
      }
      return { member, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.member || null;
}

function getDisplay(memberOrUser) {
  if (!memberOrUser) return null;
  if (memberOrUser.toString) return memberOrUser.toString();
  return `<@${memberOrUser.id}>`;
}

function getAuthorDisplay(message) {
  return message.member?.toString?.() || message.author?.toString?.() || 'Someone';
}

function getExtraLine(commandName, actionData) {
  return pickRandom(EXTRA_LINES[commandName]) || pickRandom([
    `The vibe is ${actionData.tone || 'perfect'} today.`,
    'That moment deserved a little sparkle.',
    'Consider the scene officially roleplayed.',
    'A little dramatic, a little iconic.',
    'The server felt that one.'
  ]);
}

function ordinal(value) {
  const number = Math.max(1, Number(value || 1));
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  if (number % 10 === 1) return `${number}st`;
  if (number % 10 === 2) return `${number}nd`;
  if (number % 10 === 3) return `${number}rd`;
  return `${number}th`;
}

async function incrementRoleplayCount(message, commandName, target) {
  if (!message.guild?.id || !message.author?.id) return 1;

  const guildId = message.guild.id;
  const actorId = message.author.id;
  const targetId = target?.id || null;
  const action = String(commandName || '').toLowerCase();

  try {
    const { data: current } = await db.runQuery(
      db.supabase
        .from('roleplay_counts')
        .select('*')
        .eq('guild_id', guildId)
        .eq('actor_user_id', actorId)
        .eq('target_user_id', targetId || actorId)
        .eq('action_name', action)
        .maybeSingle(),
      'roleplay:getCount'
    );

    const nextCount = Number(current?.count || 0) + 1;
    await db.runQuery(
      db.supabase
        .from('roleplay_counts')
        .upsert(
          {
            guild_id: guildId,
            actor_user_id: actorId,
            target_user_id: targetId || actorId,
            action_name: action,
            count: nextCount,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'guild_id,actor_user_id,target_user_id,action_name' }
        ),
      'roleplay:upsertCount'
    );
    return nextCount;
  } catch {
    return 1;
  }
}

function buildDescription(commandName, actionData, message, target, count = 1) {
  const author = getAuthorDisplay(message);
  const targetDisplay = getDisplay(target);
  const countText = `for the **${ordinal(count)}** time`;

  if (target && target.id === message.author.id && SELF_LINES[commandName]) {
    return `${author} ${SELF_LINES[commandName]} ${countText}`;
  }

  if (targetDisplay) {
    return `${author} ${actionData.verb} ${targetDisplay} ${countText}`;
  }

  return `${author} ${actionData.noTarget || actionData.verb} ${countText}`;
}

function getFallbackGif(commandName, actionData) {
  const searchKey = `${commandName} ${actionData.gif || ''}`.toLowerCase();
  if (searchKey.includes('hug') || searchKey.includes('cuddle') || searchKey.includes('comfort')) return pickRandom(FALLBACK_GIFS.hug);
  if (searchKey.includes('kiss') || searchKey.includes('smooch') || searchKey.includes('peck')) return pickRandom(FALLBACK_GIFS.kiss);
  if (searchKey.includes('blush') || searchKey.includes('flirt') || searchKey.includes('swoon')) return pickRandom(FALLBACK_GIFS.blush);
  if (searchKey.includes('laugh') || searchKey.includes('giggle')) return pickRandom(FALLBACK_GIFS.laugh);
  if (searchKey.includes('cry') || searchKey.includes('sob')) return pickRandom(FALLBACK_GIFS.cry);
  if (searchKey.includes('pat') || searchKey.includes('poke')) return pickRandom(FALLBACK_GIFS.pat);
  if (searchKey.includes('bonk') || searchKey.includes('whack') || searchKey.includes('paddle')) return pickRandom(FALLBACK_GIFS.bonk);
  return pickRandom(FALLBACK_GIFS.default);
}

function cleanGifSource(value = '') {
  const text = singleLine(value).replaceAll('GIF', '').replaceAll('gif', '').trim();
  if (!text) return null;
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function hasBadGifMetadata(value = '') {
  const text = String(value || '').toLowerCase();
  return BAD_GIF_WORDS.some((word) => text.includes(word));
}

function scoreTenorResult(item, commandName, actionData) {
  const description = String(item?.content_description || item?.title || '').toLowerCase();
  const tags = Array.isArray(item?.tags) ? item.tags.join(' ').toLowerCase() : '';
  const combined = `${description} ${tags}`;

  if (hasBadGifMetadata(combined)) return -999;

  let score = 0;
  const commandWords = words(`${commandName} ${actionData.gif || ''} ${actionData.tone || ''}`.toLowerCase()).filter((word) => word.length >= 3);

  for (const word of commandWords) {
    if (combined.includes(word)) score += 4;
  }

  if (combined.includes('anime')) score += 6;
  if (combined.includes(commandName)) score += 10;
  if (combined.includes(actionData.tone || '')) score += 3;
  return score;
}

async function getTenorGif(commandName, actionData) {
  const key = process.env.TENOR_API_KEY;
  if (!key) return null;

  const url = new URL('https://tenor.googleapis.com/v2/search');
  url.searchParams.set('key', key);
  url.searchParams.set('q', actionData.gif || `anime ${commandName}`);
  url.searchParams.set('limit', '20');
  url.searchParams.set('media_filter', 'gif,tinygif');
  url.searchParams.set('contentfilter', 'medium');
  url.searchParams.set('random', 'false');

  const payload = await fetch(url).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  const results = payload?.results || [];

  const ranked = results
    .map((item) => ({ item, score: scoreTenorResult(item, commandName, actionData) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const selected = pickRandom(ranked.length ? ranked : results.map((item) => ({ item, score: 0 })));
  const item = selected?.item;
  const gifUrl = item?.media_formats?.gif?.url || item?.media_formats?.tinygif?.url || null;

  if (!gifUrl) return null;

  return {
    url: gifUrl,
    source: cleanGifSource(item?.content_description || item?.title || item?.tags?.[0])
  };
}

async function getGif(commandName, actionData) {
  const tenor = await getTenorGif(commandName, actionData);
  if (tenor?.url) return tenor;

  return {
    url: getFallbackGif(commandName, actionData),
    source: null
  };
}

function prettifyCommandName(commandName) {
  const spaced = commandName.replaceAll('kiss', ' kiss').replaceAll('pat', ' pat').replaceAll('bonk', ' bonk').trim();
  return words(spaced).map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function titleCase(value = '') {
  return words(String(value || '').replaceAll('_', ' ')).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

function commandColor(actionData) {
  return GROUP_COLORS[actionData?.group] || actionData?.color || DEFAULT_COLOR;
}

function isNsfwTaggedAction(commandName) {
  return !SAFE_ACTIONS.has(String(commandName || '').toLowerCase());
}

function buildEmbed(commandName, actionData, message, target, gifData, count = 1) {
  const actorName = message.member?.displayName || message.author?.displayName || message.author?.username || 'Someone';

  return {
    author: {
      name: actorName,
      icon_url: message.author?.displayAvatarURL?.({ size: 256 }) || undefined
    },
    description: buildDescription(commandName, actionData, message, target, count),
    color: commandColor(actionData),
    image: gifData?.url ? { url: gifData.url } : undefined,
    footer: gifData?.source ? { text: `GIF via Tenor - ${gifData.source}` } : undefined
  };
}

async function sendRoleplay(message, commandName, actionData, target, gifData, count = 1) {
  return sendStyled(message, 'info', {
    embeds: [buildEmbed(commandName, actionData, message, target, gifData, count)],
    allowedMentions: {
      users: [message.author.id, target?.id].filter(Boolean),
      roles: [],
      repliedUser: false
    }
  });
}
function chunkCommands(commandNames, maxLength = 950) {
  const chunks = [];
  let current = '';
  for (const name of commandNames) {
    const piece = `\`${name}\``;
    const next = current ? `${current}, ${piece}` : piece;
    if (next.length > maxLength) {
      chunks.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildListEmbed() {
  const groups = {};
  for (const actionData of Object.values(ROLEPLAY_ACTIONS)) {
    if (!groups[actionData.group]) groups[actionData.group] = [];
    groups[actionData.group].push(actionData.name);
  }

  const fields = [];
  for (const [group, commands] of Object.entries(groups)) {
    for (const [index, chunk] of chunkCommands(commands).entries()) {
      fields.push({
        name: index === 0 ? group[0].toUpperCase() + group.slice(1) : `${group[0].toUpperCase() + group.slice(1)} ${index + 1}`,
        value: chunk,
        inline: false
      });
    }
  }

  return {
    title: 'Roleplay Directory',
    description: 'Each roleplay action is now its own command, so help and search stay a lot cleaner. Examples: `,hug @user`, `,bonk username`, `,dance`, `,roleplaylist`.',
    color: respond.DEFAULT_EMBED_COLOR,
    fields,
    footer: { text: `${ACTION_NAMES.length} direct roleplay commands` }
  };
}

async function sendBlocked(message, usedCommand) {
  return sendStyled(message, 'bad', {
    embeds: [{
      title: `${prettifyCommandName(usedCommand)} is not available`,
      description: BLOCKED_ACTIONS[usedCommand] || 'That command is not available.',
      color: ERROR_COLOR,
      footer: { text: 'Try a safer roleplay command instead.' }
    }],
    allowedMentions: { users: [], roles: [], repliedUser: false }
  });
}

async function executeRoleplayAction({ message, args, actionName }) {
  const usedCommand = String(actionName || '').toLowerCase();

  if (BLOCKED_ACTIONS[usedCommand]) {
    return sendBlocked(message, usedCommand);
  }

  if (isRoleplayBlocked(message, usedCommand)) {
    return sendStyled(message, 'bad', {
      embeds: [{
        title: 'Roleplay Command Blocked',
        description: `The \`${usedCommand}\` command is blocked in this server by moderators.`,
        color: ERROR_COLOR
      }],
      allowedMentions: { users: [], roles: [], repliedUser: false }
    });
  }

  const actionData = ROLEPLAY_ACTIONS[usedCommand];
  if (!actionData) {
    if (respond?.reply) return respond.reply(message, 'bad', 'That roleplay action does not exist.');
    return respond.reply(message, 'bad', 'That roleplay action does not exist.');
  }

  const remaining = checkCooldown(message.author.id);
  if (remaining > 0) {
    return respond.reply(message, 'info', `Slow down a little. Try again in ${(remaining / 1000).toFixed(1)}s.`);
  }

  const target = await findMemberByText(message, args);
  const count = await incrementRoleplayCount(message, usedCommand, target);
  const gifData = await getGif(usedCommand, actionData);

  return sendRoleplay(message, usedCommand, actionData, target, gifData, count);
}

function usageLinesFor(commandName) {
  return [
    `${commandName} @user`,
    `${commandName} username`,
    `${commandName} user-id`,
    `${commandName}`
  ];
}

function descriptionForAction(actionName, actionData) {
  const label = prettifyCommandName(actionName).toLowerCase();
  return `Send a ${label} roleplay scene with a target or a solo fallback.`;
}

function createRoleplayActionCommand(actionName, options = {}) {
  const actionData = ROLEPLAY_ACTIONS[actionName];
  if (!actionData) {
    throw new Error(`Unknown roleplay action: ${actionName}`);
  }

  const commandName = String(options.commandName || actionName).toLowerCase();
  const usage = usageLinesFor(commandName);

  return {
    name: commandName,
    aliases: options.aliases || [],
    category: 'roleplay',
    description: options.description || descriptionForAction(actionName, actionData),
    usage,
    examples: usage,
    typing: true,
    nsfw: options.nsfw ?? isNsfwTaggedAction(actionName),
    async execute({ message, args }) {
      return executeRoleplayAction({ message, args, actionName });
    }
  };
}

function createBlockedRoleplayCommand(actionName, options = {}) {
  const commandName = String(options.commandName || actionName).toLowerCase();
  return {
    name: commandName,
    aliases: options.aliases || [],
    category: 'roleplay',
    description: options.description || `Show why the ${commandName} roleplay command is unavailable.`,
    usage: [commandName],
    examples: [commandName],
    typing: true,
    nsfw: true,
    async execute({ message }) {
      return sendBlocked(message, actionName);
    }
  };
}

function createRoleplayListCommand() {
  return {
    name: 'roleplaylist',
    aliases: ['rplist'],
    category: 'roleplay',
    description: 'List every direct roleplay command by style.',
    usage: ['roleplaylist', 'rplist'],
    examples: ['roleplaylist', 'rplist'],
    async execute({ message }) {
      return sendStyled(message, 'info', { embeds: [buildListEmbed()] });
    }
  };
}

function createRoleplayBlockCommand() {
  return {
    name: 'roleplayblock',
    aliases: ['rpblock'],
    category: 'roleplay',
    description: 'Block selected roleplay commands or whole roleplay styles in this server.',
    usage: ['roleplayblock <command...>', 'roleplayblock <group>', 'roleplayblock all'],
    examples: ['roleplayblock flirt hug bonk', 'roleplayblock affection', 'roleplayblock all'],
    guildOnly: true,
    permissions: [PermissionFlagsBits.ManageGuild],
    async execute({ message, args }) {
      return handleRoleplayBlock(message, args, true);
    }
  };
}

function createRoleplayUnblockCommand() {
  return {
    name: 'roleplayunblock',
    aliases: ['rpunblock'],
    category: 'roleplay',
    description: 'Unblock roleplay commands or styles in this server.',
    usage: ['roleplayunblock <command...>', 'roleplayunblock <group>', 'roleplayunblock all'],
    examples: ['roleplayunblock hug', 'roleplayunblock affection', 'roleplayunblock all'],
    guildOnly: true,
    permissions: [PermissionFlagsBits.ManageGuild],
    async execute({ message, args }) {
      return handleRoleplayBlock(message, args, false);
    }
  };
}

function createRoleplayBlockedCommand() {
  return {
    name: 'roleplayblocked',
    aliases: ['rpblocked'],
    category: 'roleplay',
    description: 'Show which roleplay commands are currently blocked in this server.',
    usage: ['roleplayblocked', 'rpblocked'],
    examples: ['roleplayblocked', 'rpblocked'],
    guildOnly: true,
    async execute({ message }) {
      return handleRoleplayBlockedList(message);
    }
  };
}

module.exports = {
  ACTION_SPECS,
  ACTION_NAMES,
  BLOCKED_NAMES,
  BLOCKED_ACTIONS,
  ROLEPLAY_ACTIONS,
  buildListEmbed,
  createBlockedRoleplayCommand,
  createRoleplayActionCommand,
  createRoleplayBlockCommand,
  createRoleplayBlockedCommand,
  createRoleplayListCommand,
  createRoleplayUnblockCommand,
  executeRoleplayAction,
  isNsfwTaggedAction
};
