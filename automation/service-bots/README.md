# Service bots

Código independiente para María Ángel/FUMIGACION y Miguel Ángel/S.TECNICO.

Estado, configuración, límites y comprobaciones: [BOTS_MARIA_MIGUEL.md](../../docs/BOTS_MARIA_MIGUEL.md).

Pruebas aisladas, sin mensajes externos:

```sh
node --test tests/service-bots.test.mjs tests/service-bots-history.test.mjs
```

Importación local en directorio privado ignorado por Git:

```sh
node automation/service-bots/import-local.mjs <directorio-historico> .tmp/service-bots-20261002
```

El código y la importación local no acreditan activación en el servidor.
