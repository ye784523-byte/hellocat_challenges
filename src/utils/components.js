import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export async function awaitButton(interaction, customId, { time = 120_000, filterUser = true } = {}) {
  try {
    const response = await interaction.awaitMessageComponent({
      componentType: ComponentType.Button,
      time,
      filter: (component) =>
        component.customId === customId && (!filterUser || component.user.id === interaction.user.id),
    });
    return response;
  } catch {
    return null;
  }
}

export async function awaitModal(interaction, modal, { time = 300_000 } = {}) {
  try {
    await interaction.showModal(modal);
    const submitted = await interaction.awaitModalSubmit({
      time,
      filter: (component) =>
        component.customId === modal.data.custom_id && component.user.id === interaction.user.id,
    });
    return submitted;
  } catch {
    return null;
  }
}

export async function paginate(interaction, { pages, componentsFor, time = 180_000, ephemeral = false }) {
  let index = 0;
  const total = pages.length;
  if (total === 0) return;

  const payload = () => ({
    embeds: [pages[index]],
    components: componentsFor(index, total),
    ephemeral,
  });

  const message = await interaction.editReply(payload());
  if (total === 1) return;

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time,
    filter: (button) => button.user.id === interaction.user.id,
  });

  collector.on('collect', async (button) => {
    if (button.customId === 'page:prev') index = (index - 1 + total) % total;
    else if (button.customId === 'page:next') index = (index + 1) % total;
    else if (button.customId === 'page:close') {
      collector.stop('closed');
      await button.update({ components: [] });
      return;
    }
    await button.update(payload());
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch {
      /* interaction or message expired */
    }
  });
}

export function paginationRow(index, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('page:prev')
      .setLabel('◀ PREV')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId('page:next')
      .setLabel('NEXT ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId('page:close')
      .setLabel('CLOSE')
      .setStyle(ButtonStyle.Danger),
  );
}

export function textInput(customId, label, { style = TextInputStyle.Short, required = true, maxLength = 400, value, placeholder } = {}) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(maxLength);
  if (value) input.setValue(value);
  if (placeholder) input.setPlaceholder(placeholder);
  return input;
}

export function modal(customId, title, inputs) {
  const builder = new ModalBuilder().setCustomId(customId).setTitle(title);
  builder.addComponents(inputs.map((input) => new ActionRowBuilder().addComponents(input)));
  return builder;
}

export function prefixLines(lines) {
  return lines.filter(Boolean).join('\n');
}
