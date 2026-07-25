<!-- 
  @component RootLayout
  The foundational SvelteKit root layout file[cite: 17].
  Responsible for importing global stylesheets and providing the primary `<main>` DOM wrapper 
  that encapsulates all subsequent pages and child components[cite: 17].
-->
<script>
  // Import global CSS (base styles, CSS variables, and layout resets)[cite: 17]
  import "../app.css";

  /**
   * @type {{ children: import('svelte').Snippet }}
   * Svelte 5 syntax for accepting and extracting the child route snippet passed by the router[cite: 17].
   */
  let { children } = $props();
</script>

<!-- The root DOM node that encapsulates the entire application[cite: 17] -->
<main>
  <!-- Dynamically renders the currently active route (e.g., +page.svelte) inside this layout[cite: 17] -->
  {@render children()}
</main>
