// Punto de entrada para Vercel: debe importar express y exportar la app por defecto.
import express from 'express';
import { createApp } from './create-app.js';

export default createApp(undefined, undefined, express());
