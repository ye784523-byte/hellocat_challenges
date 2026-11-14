import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { hintFlow } from '../../utils/challengeFlow.js';

export default {
  category: 'ctf',
  cooldown: 8,
  data: new SlashCommandBuilder()
    .setName('hint')
    .setDescription('Request an intelligence fragment for a challenge.')
    .addStringOption((option) =>
      option
        .setName('challenge')
        .setDescription('Challenge ID, e.g. HC-001.')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('index')
        .setDescription('Hint number (1-based). Defaults to the next locked hint.')
        .setMinValue(1)
        .setMaxValue(5),
    ),
  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused().toLowerCase();
    const challenges = await ctx.services.challengeService.list();
    await interaction.respond(
      challenges
        .filter((challenge) => challenge.hints?.length > 0)
        .filter(
          (challenge) =>
            challenge.id.toLowerCase().includes(focused) ||
            challenge.title.toLowerCase().includes(focused),
        )
        .slice(0, 25)
        .map((challenge) => ({ name: `${challenge.id} // ${challenge.title}`, value: challenge.id })),
    );
  },
  async execute(interaction, ctx) {
    const id = interaction.options.getString('challenge').toUpperCase();
    const index = interaction.options.getInteger('index');
    const challenge = await ctx.services.challengeService.get(id);
    if (!challenge || !challenge.active || !challenge.published) {
      return interaction.reply({ embeds: [errorEmbed('Challenge not found or not active.')], ephemeral: true });
    }
    return hintFlow(interaction, ctx, challenge, index ? index - 1 : null);
  },
};
