import { createApp } from './app.js';

const app = createApp();
// En Vercel el servidor se detecta solo (export default); en local escucha en un puerto.
if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Amigo Secreto en http://localhost:${port}`));
}
export default app;
