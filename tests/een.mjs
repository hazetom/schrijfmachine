// draait één test uit app.test.mjs op naam (deel van de naam)
process.env.ALLEEN = process.argv[2];
await import('./app.test.mjs');
