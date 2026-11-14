import { Events } from 'discord.js';
import { AntiSpamTracker } from '../utils/antiSpam.js';
import { brandEmbed, warningEmbed } from '../utils/embeds.js';
import { officialSiteUrl, terminalUrl } from '../utils/links.js';
import { BRAND, COLORS } from '../constants/index.js';

const tracker = new AntiSpamTracker();

/** How often the same operator may trigger the assistant, in milliseconds. */
const ASSISTANT_COOLDOWN = 60_000;

/** Words that mean the operator is asking for help. */
const HELP_KEYWORDS = [
  'help',
  'hint',
  'flag',
  'solve',
  'challenge',
  'terminal',
  'web',
  'stuck',
  'how do i',
  'how to',
];

const lastReply = new Map();

function isHelpRequest(message, botUser) {
  if (botUser && message.mentions.has(botUser)) return true;
  const content = message.content.toLowerCase();
  return HELP_KEYWORDS.some((keyword) => content.includes(keyword));
}

export default {
  name: Events.MessageCreate,
  async execute(message, ctx) {
    if (!message.inGuild() || message.author.bot || !message.member) return;

    const result = tracker.record(message.author.id, message.content);
    if (result.violation) {
      if (tracker.canWarn(message.author.id)) {
        ctx.logger.warn('Anti-spam signal detected', {
          userId: message.author.id,
          guildId: message.guildId,
          channelId: message.channelId,
          violation: result.violation,
          count: result.count,
        });

        const reason =
          result.violation === 'duplicate'
            ? 'Duplicate message pattern detected. Please avoid repetitive spam.'
            : 'High message rate detected. Please slow down.';

        await message
          .reply({
            embeds: [warningEmbed(`${reason}\nModerators have not taken automatic action.`, 'ANTI-SPAM SIGNAL')],
            allowedMentions: { repliedUser: false },
          })
          .catch(() => null);
      }
      return;
    }

    if (!ctx.config.ASSISTANT_ENABLED) return;
    if (ctx.config.GUILD_ID && message.guildId !== ctx.config.GUILD_ID) return;
    if (!isHelpRequest(message, ctx.client.user)) return;

    const previous = lastReply.get(message.author.id) ?? 0;
    if (Date.now() - previous < ASSISTANT_COOLDOWN) return;
    lastReply.set(message.author.id, Date.now());

    const webUrl = terminalUrl(ctx.config);
    const officialSite = officialSiteUrl(ctx.config);
    const fields = [
      { name: 'CHALLENGES', value: '`/challenge browse` — pick a target from the board.', inline: true },
      { name: 'HINTS', value: '`/hint challenge:HC-001` — unlock the next fragment.', inline: true },
      { name: 'PROGRESS', value: '`/profile` — your rank, streak and captures.', inline: true },
      { name: 'RANKING', value: '`/leaderboard` — who captured the most challenges.', inline: true },
    ];
    if (webUrl) {
      fields.push({
        name: 'WEB TERMINAL',
        value: `[Open the Hello Cat web terminal](${webUrl}) — flags are submitted there, in a real shell against a fictional lab.`,
      });
    }
    fields.push({
      name: 'OFFICIAL SITE',
      value: `[${officialSite}](${officialSite}) — Discord is the only supported platform.`,
    });

    await message
      .reply({
        embeds: [
          brandEmbed({
            title: '[ HELLO CAT // CHANNEL ASSISTANT ]',
            description:
              'Flags are submitted in the web terminal — the channel keeps the briefings, the hints and the leaderboard.\n\n' +
              'Here is the fastest route to your next capture.',
            color: COLORS.info,
            fields,
            footer: `${BRAND.footer} • ASK ME ANY TIME`,
          }),
        ],
        allowedMentions: { repliedUser: false },
      })
      .catch(() => null);
  },
};
