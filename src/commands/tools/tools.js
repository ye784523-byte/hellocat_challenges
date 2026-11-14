import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, codeBlock, errorEmbed, truncate } from '../../utils/embeds.js';
import {
  ENCODING_SCHEMES,
  HASH_ALGORITHMS,
  ToolError,
  analyzeText,
  caesarBruteforce,
  decodeJwt,
  decodeWith,
  encodeWith,
  hashText,
  identifyHash,
  vigenere,
  xorText,
} from '../../utils/cyberToolkit.js';

const TEXT_MAX = 4000;

const SCHEME_CHOICES = [
  { name: 'Base64', value: 'base64' },
  { name: 'Base64url', value: 'base64url' },
  { name: 'Hexadecimal', value: 'hex' },
  { name: 'Binary', value: 'binary' },
  { name: 'URL percent-encoding', value: 'url' },
  { name: 'ROT13', value: 'rot13' },
  { name: 'Caesar shift', value: 'caesar' },
  { name: 'Atbash', value: 'atbash' },
  { name: 'Morse code', value: 'morse' },
  { name: 'Reverse', value: 'reverse' },
];

const ALGORITHM_CHOICES = HASH_ALGORITHMS.map((algorithm) => ({
  name: algorithm.toUpperCase(),
  value: algorithm,
}));

function textOption(option, description = 'Text or artifact to transform.') {
  return option.setName('text').setDescription(description).setRequired(true).setMaxLength(TEXT_MAX);
}

function schemeOption(option) {
  return option
    .setName('scheme')
    .setDescription('Encoding or cipher to use.')
    .setRequired(true)
    .addChoices(...SCHEME_CHOICES.filter((choice) => ENCODING_SCHEMES.includes(choice.value)));
}

function shiftOption(option) {
  return option
    .setName('shift')
    .setDescription('Caesar shift amount (1-25, default 3).')
    .setMinValue(1)
    .setMaxValue(25)
    .setRequired(false);
}

function panel({ title = '[ HELLO CAT // FIELD TOOLKIT ]', description, color = COLORS.green, fields }) {
  return brandEmbed({
    title,
    description,
    color,
    fields,
    footer: `${BRAND.footer} • AUTHORIZED TRAINING ONLY`,
  });
}

function outputField(label, value) {
  return { name: label, value: codeBlock(truncate(String(value ?? '').replace(/```/g, '` ` `'), 1000)) };
}

function resultFields({ scheme, input, output, extra = [] }) {
  return [
    { name: 'SCHEME', value: scheme.toUpperCase(), inline: true },
    ...(extra.length ? extra : []),
    outputField('INPUT', input),
    outputField('OUTPUT', output),
  ];
}

async function run(interaction, ctx, handler) {
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (error) {
    ctx.logger.warn('Tool interaction could not be acknowledged', {
      command: interaction.commandName,
      error: error.message,
    });
    return;
  }
  try {
    const embed = await handler();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof ToolError) {
      await interaction
        .editReply({ embeds: [errorEmbed(error.message, 'TOOL ERROR')] })
        .catch(() => null);
      return;
    }
    ctx.logger.error('Tool command failed', {
      command: interaction.commandName,
      subcommand: interaction.options.getSubcommand(false),
      error: error.message,
    });
    await interaction
      .editReply({ embeds: [errorEmbed('The tool could not process that input.')] })
      .catch(() => null);
  }
}

export default {
  category: 'tools',
  cooldown: 3,
  data: new SlashCommandBuilder()
    .setName('tools')
    .setDescription('Offline CTF utilities for decoding, cracking and analyzing artifacts.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('decode')
        .setDescription('Decode or decrypt an artifact.')
        .addStringOption((option) => schemeOption(option))
        .addStringOption((option) => textOption(option))
        .addIntegerOption((option) => shiftOption(option)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('encode')
        .setDescription('Encode or encrypt text.')
        .addStringOption((option) => schemeOption(option))
        .addStringOption((option) => textOption(option, 'Plaintext to encode.'))
        .addIntegerOption((option) => shiftOption(option)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('caesar')
        .setDescription('Brute-force all 26 Caesar shifts.')
        .addStringOption((option) => textOption(option, 'Ciphertext to brute-force.')),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('hash')
        .setDescription('Compute a hash digest or identify a hash type.')
        .addStringOption((option) =>
          option
            .setName('algorithm')
            .setDescription('Hash algorithm (choose identify to detect a digest type).')
            .setRequired(true)
            .addChoices(...ALGORITHM_CHOICES, { name: 'Identify hash type', value: 'identify' }),
        )
        .addStringOption((option) => textOption(option, 'Text to hash, or digest to identify.')),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('xor')
        .setDescription('XOR data with a repeating key.')
        .addStringOption((option) => textOption(option, 'Ciphertext to XOR.'))
        .addStringOption((option) =>
          option.setName('key').setDescription('Repeating XOR key (UTF-8 text).').setRequired(true).setMaxLength(200),
        )
        .addStringOption((option) =>
          option
            .setName('format')
            .setDescription('Input format (default text).')
            .addChoices({ name: 'Text', value: 'text' }, { name: 'Hex', value: 'hex' }),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('vigenere')
        .setDescription('Encode or decode a Vigenere cipher.')
        .addStringOption((option) => textOption(option))
        .addStringOption((option) =>
          option.setName('key').setDescription('Alphabetic Vigenere key, e.g. CAT.').setRequired(true).setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Direction (default decode).')
            .addChoices({ name: 'Decode', value: 'decode' }, { name: 'Encode', value: 'encode' }),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('jwt')
        .setDescription('Decode a JWT header and payload without verifying it.')
        .addStringOption((option) => textOption(option, 'JWT token.')),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('analyze')
        .setDescription('Extract indicators and detect common encodings.')
        .addStringOption((option) => textOption(option, 'Artifact or capture text to analyze.')),
    ),

  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'decode' || subcommand === 'encode') {
      return run(interaction, ctx, async () => {
        const scheme = interaction.options.getString('scheme');
        const text = interaction.options.getString('text');
        const shift = interaction.options.getInteger('shift') ?? 3;
        const output =
          subcommand === 'decode'
            ? decodeWith(scheme, text, { shift })
            : encodeWith(scheme, text, { shift });
        return panel({
          description: `**${subcommand.toUpperCase()}** complete.`,
          fields: resultFields({
            scheme,
            input: text,
            output,
            extra: scheme === 'caesar' ? [{ name: 'SHIFT', value: String(shift), inline: true }] : [],
          }),
        });
      });
    }

    if (subcommand === 'caesar') {
      return run(interaction, ctx, async () => {
        const text = interaction.options.getString('text');
        const lines = caesarBruteforce(text).map(
          (entry) => `[${String(entry.shift).padStart(2, '0')}] ${entry.text}`,
        );
        return panel({
          description: 'All 26 rotations, newest shift first. Look for readable plaintext.',
          fields: [{ name: 'ROTATIONS', value: codeBlock(truncate(lines.join('\n'), 3900)) }],
        });
      });
    }

    if (subcommand === 'hash') {
      return run(interaction, ctx, async () => {
        const algorithm = interaction.options.getString('algorithm');
        const text = interaction.options.getString('text');
        if (algorithm === 'identify') {
          const type = identifyHash(text);
          return panel({
            title: '[ HASH IDENTIFIER ]',
            color: type ? COLORS.info : COLORS.warning,
            description: type
              ? `Likely hash type: **${type}**`
              : 'No known hash signature matched. Check length and alphabet.',
            fields: [outputField('INPUT', text)],
          });
        }
        const digest = hashText(text, algorithm);
        return panel({
          title: '[ HASH GENERATOR ]',
          fields: [
            { name: 'ALGORITHM', value: algorithm.toUpperCase(), inline: true },
            outputField('INPUT', text),
            outputField('DIGEST', digest),
          ],
        });
      });
    }

    if (subcommand === 'xor') {
      return run(interaction, ctx, async () => {
        const text = interaction.options.getString('text');
        const key = interaction.options.getString('key');
        const inputFormat = interaction.options.getString('format') ?? 'text';
        const result = xorText(text, key, { inputFormat });
        return panel({
          title: '[ XOR TRANSFORM ]',
          fields: [
            { name: 'KEY', value: `\`${key}\``, inline: true },
            { name: 'INPUT', value: inputFormat.toUpperCase(), inline: true },
            outputField('OUTPUT HEX', result.hex),
            outputField('OUTPUT TEXT', result.utf8 ?? '(not printable UTF-8)'),
          ],
        });
      });
    }

    if (subcommand === 'vigenere') {
      return run(interaction, ctx, async () => {
        const text = interaction.options.getString('text');
        const key = interaction.options.getString('key');
        const mode = interaction.options.getString('mode') ?? 'decode';
        const output = vigenere(text, key, { mode });
        return panel({
          title: '[ VIGENERE CIPHER ]',
          fields: resultFields({
            scheme: `vigenere ${mode}`,
            input: text,
            output,
            extra: [{ name: 'KEY', value: `\`${key}\``, inline: true }],
          }),
        });
      });
    }

    if (subcommand === 'jwt') {
      return run(interaction, ctx, async () => {
        const token = interaction.options.getString('text');
        const decoded = decodeJwt(token);
        return panel({
          title: '[ JWT INSPECTOR // SIGNATURE NOT VERIFIED ]',
          color: COLORS.info,
          fields: [
            { name: 'ALGORITHM', value: `\`${decoded.algorithm ?? 'none'}\``, inline: true },
            { name: 'SIGNATURE', value: decoded.signed ? 'Present (not verified)' : 'Missing / unsecured', inline: true },
            outputField('HEADER', JSON.stringify(decoded.header, null, 2)),
            outputField('PAYLOAD', JSON.stringify(decoded.payload, null, 2)),
          ],
        });
      });
    }

    if (subcommand === 'analyze') {
      return run(interaction, ctx, async () => {
        const text = interaction.options.getString('text');
        const analysis = analyzeText(text);
        const fields = [];
        const add = (name, values) => {
          if (values.length === 0) return;
          fields.push({ name, value: truncate(values.map((value) => `\`${value}\``).join(', '), 600) });
        };
        add(`FLAGS (${analysis.flags.length})`, analysis.flags);
        add(`IP ADDRESSES (${analysis.ips.length})`, analysis.ips);
        add(`DOMAINS (${analysis.domains.length})`, analysis.domains);
        add(`URLS (${analysis.urls.length})`, analysis.urls);
        add(`EMAILS (${analysis.emails.length})`, analysis.emails);
        add(`MAC ADDRESSES (${analysis.macs.length})`, analysis.macs);
        add(`HASH-LIKE (${analysis.hashes.length})`, analysis.hashes);
        if (analysis.encodings.length > 0) {
          fields.push({
            name: `ENCODING CANDIDATES (${analysis.encodings.length})`,
            value: truncate(
              analysis.encodings
                .slice(0, 8)
                .map((entry) => `**${entry.scheme}** \`${truncate(entry.preview, 60)}\` → \`${truncate(entry.decoded, 160)}\``)
                .join('\n'),
              1000,
            ),
          });
        }
        return panel({
          title: '[ ARTIFACT ANALYSIS ]',
          color: fields.length ? COLORS.green : COLORS.warning,
          description: fields.length
            ? 'Indicators extracted from the supplied artifact. Encoded candidates are best-effort guesses.'
            : 'No obvious indicators or encodings were detected.',
          fields,
        });
      });
    }

    return interaction.reply({ embeds: [errorEmbed('Unknown tools subcommand.')], ephemeral: true });
  },
};
