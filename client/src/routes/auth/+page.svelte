<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  // /auth is kept for backward-compat — redirect to canonical /login
  onMount(() => goto("/login", { replaceState: true }));
</script>

<svelte:head><title>Login · Innoserve Techsol</title></svelte:head>
