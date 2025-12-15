import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { StoryCache } from "../utils/db_queries.js";
import { chunkString } from "../utils/embeds.js";

export interface SheetStory {
  title: string;
  genre: string;
  content: string;
}

export const data = new SlashCommandBuilder()
  .setName("library")
  .setDescription("Read to your heart's content")
  .addStringOption((o) => o.setName("genre").setDescription("Story genre / category").setRequired(false).setAutocomplete(true))
  .addStringOption((o) => o.setName("title").setDescription("Story title").setRequired(false).setAutocomplete(true));

function getRandomElement<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickStoryFromCache(
  title?: string | null,
  genre?: string | null
): SheetStory | null {
  // 1. Title explicitly set → exact match
  if (title) {
    const found = StoryCache.stories.find(
      s => s.title.toLowerCase() === title.toLowerCase()
    );
    return found ?? null;
  }

  // 2. Genre set → random story from that genre
  if (genre) {
    const titles = StoryCache.titlesByGenre.get(genre);
    if (!titles || titles.length === 0) return null;

    const randomTitle = getRandomElement(titles);
    if (!randomTitle) return null;

    return (
      StoryCache.stories.find(s => s.title === randomTitle) ?? null
    );
  }

  // 3. Neither set → random story overall
  const randomStory = getRandomElement(StoryCache.stories);
  return randomStory ?? null;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  
  const title = interaction.options.getString('title');
  const genre = interaction.options.getString('genre');

  const story = pickStoryFromCache(title, genre);

  if (!story) {
    await interaction.reply({
      content: 'No story found for the given parameters.',
      ephemeral: true,
    });
    return;
  }

  const pages = chunkString(story.content, 3500);
  let pageIndex = 0;

  const buildEmbed = () =>
    new EmbedBuilder()
      .setTitle(story.title)
      .setDescription(pages[pageIndex] ?? null)
      .setFooter({
        text: `Page ${pageIndex + 1} / ${pages.length} • Genre: ${story.genre}`,
      })
      .setColor(0x5865f2);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
  );

  const response = await interaction.reply({
    embeds: [buildEmbed()],
    components: pages.length > 1 ? [row] : [],
    withResponse: true,
  });

  const message = response.resource?.message;

  if (pages.length <= 1) return;

  const collector = message?.createMessageComponentCollector({
    time: 5 * 60_000,
  });

  collector?.on('collect', async i => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: 'Not your story!', ephemeral: true });
      return;
    }

    if (i.customId === 'prev') {
      pageIndex = Math.max(0, pageIndex - 1);
    } else if (i.customId === 'next') {
      pageIndex = Math.min(pages.length - 1, pageIndex + 1);
    }

    await i.update({ embeds: [buildEmbed()] });
  });
}