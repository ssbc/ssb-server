module.exports = function(server) {
	server.on('log:info', console.log)
	server.on('log:warning', console.warn)
	server.on('log:error', console.error)
}