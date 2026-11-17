# Provider synchronisation

Nimay OMP Chat keeps the provider list in two places: the PC's `~/.omp/agent/models.yml` (owned by OMP) and the app's local provider store. This document describes exactly what moves in which direction.

## The rule

> **The PC is the source of truth for providers and API keys.**
> The app is an editor with a cache.

A provider entry on the PC looks roughly like this:

```yaml
providers:
  openai:
    baseUrl: https://api.openai.com/v1
    apiKey: sk-...
    models:
      - gpt-5
      - o3
  ollama:
    baseUrl: http://192.168.1.10:11434/v1
    apiKey: ""
    models:
      - gemma3:4b
```

## What is synced, what stays local

| Field | Direction | Notes |
|---|---|---|
| Provider id | PC â†’ app | The id is the key in `models.yml` and doubles as the display name |
| `baseUrl` | PC â‡„ app | Editable on both sides |
| `apiKey` | PC â‡„ app | Written to the Android Keystore when it arrives on the phone |
| Model list of a provider | PC â‡„ app | |
| `enabled` / active state | app only | Never written back to `models.yml` |
| Favourites | app only | |
| Hidden models | app only | |
| Provider test result | app only | |
| Extra app-only fields | app only | |

## Pull â€” PC to phone

1. The app connects to the bridge (manual entry, QR code or `omp2://` deep link).
2. After the connection is established, the app calls `GET /api/omp/providers`.
3. Every provider is merged into the local store. API keys are stored in the Android Keystore; the plain key never touches the app's database.
4. The provider list in the app now mirrors the PC.

## Push â€” phone to PC

1. You add, edit or delete a provider in the app.
2. You tap **Sync** in the provider screen.
3. The app compares its local providers with the PC's and sends the differences:

| Change | Request |
|---|---|
| New provider | `POST /api/omp/providers` with `{"provider": {...}}` |
| Edited provider | `POST /api/omp/providers` with the same shape |
| Deleted provider | `DELETE /api/omp/providers?id=<id>` |

The bridge rewrites `models.yml` after every write and answers with the resulting state, so the app can confirm the round trip.

### Ids

OMP provider entries have no separate display name. The provider id is therefore the name.

When you create a provider in the app, the id is derived from the name you type (`OpenAI â†’ openai`, `My Router â†’ my-router`), and a numeric suffix is added if that id already exists. This keeps the PC and the app pointing at the same entry instead of overwriting a provider of the same type.

## Failure handling

- If the bridge is unreachable, the app keeps the local change and shows a notification. Nothing is lost.
- The app never sends a partial provider. If the push fails, the local provider stays marked as not synced so you can retry.
- The bridge rewrites `models.yml` with a minimal YAML writer: unmanaged fields are preserved, but comments, key order and quoting can change.

## REST reference

All endpoints require `Authorization: Bearer <token>`.

| Method | Path | Body / query | Result |
|---|---|---|---|
| `GET` | `/api/omp/providers` | â€” | `{ "providers": [ ... ] }` |
| `POST` | `/api/omp/providers` | `{"provider": {...}}` or a flat provider object | The stored provider |
| `DELETE` | `/api/omp/providers?id=<id>` | â€” | `{ "ok": true }` |

The bridge accepts both the wrapped (`{"provider": {...}}`) and the flat body shape for `POST`.

## Security

- API keys travel over the local network inside the bearer-token protected API. Use a trusted network (LAN or Tailscale); never expose the bridge port to the internet.
- On the phone, keys are stored in the Android Keystore.
- On the PC, `models.yml` holds the keys in plain text â€” that is how OMP works. Protect the file with normal filesystem permissions and never commit it.

