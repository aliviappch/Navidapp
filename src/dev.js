// Servidor local: npm start
import app from './app.js';

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Amigo Secreto en http://localhost:${port}`));
