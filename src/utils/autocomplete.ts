import { AutocompleteInteraction } from "discord.js";
import { CharCache, StoryCache } from "./db_queries.js";

export async function autocomplete(
  interaction: AutocompleteInteraction
) {
  const focusedOption = interaction.options.getFocused(true);
  const focused = String(focusedOption.value ?? '').toLowerCase();
  let cache: string[] = []

  if (focusedOption.name === 'genre'){
    console.log("autocomplete genre")
    cache = StoryCache.genres
  }
  else if (focusedOption.name === 'title'){
    console.log("autocomplete title")
    const genre = interaction.options.getString('genre');
    cache = genre ? StoryCache.titlesByGenre.get(genre) ?? [] : StoryCache.allTitles ?? []
  }
  else{
    console.log("autocomplete char")
    let userField = 'user'
    const match = focusedOption.name.match(/^char(\d+)$/)
    if (match){
      userField = `user${match[1]}`;
    }
    const rawUserOpt = interaction.options.get(userField);
    const resolvedUserId =
    (rawUserOpt?.value as string | undefined) ?? interaction.user.id;
    cache = CharCache.charsByUser.get(resolvedUserId) ?? [];
  }

  // Filter + limit for Discord autocomplete
  const choices = cache
    .filter(name =>
      name.toLowerCase().includes(focused)
    )
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 25)
    .map(name => ({
      name,
      value: name,
    }));

  await interaction.respond(choices);
}