const { app } = require('./server');

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`选购助手已启动：http://localhost:${port}`);
});
