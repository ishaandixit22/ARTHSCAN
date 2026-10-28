<script lang="ts">
  import { page } from "$app/state";
</script>

<div class="page">
  <div class="card card-body err">
    <h1>{page.status === 404 ? "Not found" : "Something went wrong"}</h1>
    <p class="sub">{page.error?.message}</p>
    <p><a class="btn small" href="/">Back to markets</a></p>
  </div>
</div>

<style>
  .err { display: grid; gap: 10px; max-width: 560px; }
</style>
