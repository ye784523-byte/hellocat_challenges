import { Events } from 'discord.js';
import { BRAND, COLORS } from '../constants/index.js';
import { brandEmbed } from '../utils/embeds.js';
import { officialSiteUrl, terminalUrl } from '../utils/links.js';
import { WELCOME_STEPS, WELCOME_LINKS } from '../constants/welcome.js';

/**
 * Welcomes new members and walks them through participating in a challenge.
 *
 * The guide is sent as a direct message so it stays private and readable.
 * When the member has direct messages disabled, a short greeting is posted
 * in the channel instead.
 */

function guideEmbed(member, { webUrl = '', officialSiteUrl = '', isPrivate = true } = {}) {
  const steps = WELCOME_STEPS.map(
    (entry) =>
      `**${entry.step} — ${entry.title}**\n` +
      `\`${entry.command}\`  ${entry.detail}`,
  ).join('\n\n');

  const fields = [
    { name: 'HOW TO PARTICIPATE', value: steps, inline: false },
    {
      name: 'COMMANDS',
      value: WELCOME_LINKS.map((link) => `\`${link.command}\` — ${link.label}`).join('\n'),
      inline: false,
    },
  ];
  if (webUrl) {
    fields.push({
      name: 'WEB TERMINAL',
      value: `[Open the Hello Cat web terminal](${webUrl}) — sign in with Discord, then load the challenge from the panel.`,
      inline: false,
    });
  }
  if (officialSiteUrl) {
    fields.push({
      name: 'OFFICIAL SITE',
      value:
        `[${officialSiteUrl}](${officialSiteUrl}) — the only official website. ` +
        'Discord is the only supported platform; we never ask for your password, your token or money.',
      inline: false,
    });
  }

  return brandEmbed({
    title: '[ WELCOME TO THE HELLO CAT LABS ]',
    description:
      `Welcome, **${member.user.username}**. This server runs authorised security labs: fictional systems, ` +
      'real techniques, zero risk to anything that is not yours.\n\n' +
      'Captures are celebrated in the channel with your ranking, your total solves and your CATCOINS, so the ' +
      'terminal is where the work happens.',
    color: COLORS.green,
    fields,
    footer: `${BRAND.footer} • ${isPrivate ? 'PRIVATE BRIEFING' : 'CHANNEL BRIEFING'}`,
  });
}

function greetingEmbed(member, { webUrl = '', officialSiteUrl = '' } = {}) {
  const description =
    `**${member.user.username}** just joined the labs.\n\n` +
    'New here? Start with `/challenge browse difficulty:Easy`, read the brief and capture the flag in the web terminal.';
  const fields = [
    { name: 'FIRST STEP', value: '`/challenge browse difficulty:Easy`', inline: true },
    { name: 'FLAGS', value: 'Submitted in the web terminal', inline: true },
  ];
  if (webUrl) {
    fields.push({ name: 'WEB TERMINAL', value: `[Open it](${webUrl})`, inline: true });
  }
  if (officialSiteUrl) {
    fields.push({
      name: 'OFFICIAL SITE',
      value: `[${officialSiteUrl}](${officialSiteUrl}) — Discord is the only supported platform.`,
      inline: true,
    });
  }
  return brandEmbed({
    title: '[ WELCOME TO THE HELLO CAT LABS ]',
    description,
    color: COLORS.green,
    fields,
    footer: `${BRAND.footer} • /help FOR EVERY COMMAND`,
  });
}

export default {
  name: Events.GuildMemberAdd,
  async execute(member, ctx) {
    if (!member?.user || member.user.bot) return;
    if (ctx.config.GUILD_ID && member.guild?.id !== ctx.config.GUILD_ID) return;
    if (!ctx.config.WELCOME_ENABLED) return;

    const webUrl = terminalUrl(ctx.config);
    const officialSite = officialSiteUrl(ctx.config);

    ctx.logger.info('Welcoming new member', {
      userId: member.user.id,
      username: member.user.username,
      guildId: member.guild?.id,
    });

    let delivered = false;
    if (ctx.config.WELCOME_DM_ENABLED !== false) {
      try {
        await member.send({
          embeds: [guideEmbed(member, { webUrl, officialSiteUrl: officialSite, private: true })],
        });
        delivered = true;
      } catch (error) {
        ctx.logger.info('Welcome direct message could not be delivered', {
          userId: member.user.id,
          reason: error.code ?? error.message,
        });
      }
    }

    if (delivered) return;

    // No direct messages, so the greeting goes to the channel.
    const channelId = ctx.config.WELCOME_CHANNEL_ID || ctx.config.ANNOUNCEMENT_CHANNEL_ID;
    const channel = channelId
      ? ctx.client.channels.cache.get(channelId) ??
        ctx.client.guilds.cache.get(member.guild?.id)?.channels?.cache?.get(channelId)
      : member.guild?.systemChannel;
    if (!channel?.isTextBased?.()) return;

    await channel
      .send({
        content: `Welcome **${member.user.username}**.`,
        embeds: [greetingEmbed(member, { webUrl, officialSiteUrl: officialSite })],
      })
      .catch((error) => {
        ctx.logger.warn('Welcome greeting failed', { error: error.message });
      });
  },
};
