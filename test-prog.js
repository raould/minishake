const shk = require('./dist/shk.js');
console.log(shk.targets);
shk.targets(process.cwd(), { file: 'build.shk' }).then(() => console.log('success!'));
