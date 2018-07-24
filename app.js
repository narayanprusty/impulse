const express = require("express")
const app = express()
var bodyParser = require('body-parser')
var MongoClient = require("mongodb").MongoClient;
let sha3 = require('js-sha3');
let elliptic = require('elliptic');
let ec = new elliptic.ec('secp256k1');

let mongoURL = process.env.mongoURL || process.env.MONGO_URL || "mongodb://18.237.94.215:32153";
let instanceId = process.env.instanceId;

let db = null;

MongoClient.connect(mongoURL, {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
    if(!err) {
        db = database.db("admin");

        db.collection("networks").updateOne({instanceId: instanceId}, { $set: {impulseStatus: "running"}}, function(err, res) {});
    }
})

app.use(bodyParser.json())

app.post("/writeObject", function (req, res) {
    let encryptedData = req.body.encryptedData;
    let publicKey = req.body.publicKey;
    let signature = req.body.signature;
    let metadata = req.body.metadata;
    let capsule = req.body.capsule;

    let ciphertext_hash = sha3.keccak256(encryptedData);
    let hexToDecimal = (x) => ec.keyFromPrivate(x, "hex").getPrivate().toString(10);
    let pubKeyRecovered = ec.recoverPubKey(hexToDecimal(ciphertext_hash), signature, signature.recoveryParam, "hex").encodeCompressed("hex");

    let obj = {};

    obj.encryptedData = encryptedData;
    obj.encryptedDataHash = ciphertext_hash;
    obj.publicKey = publicKey;
    obj.metadata = metadata;
    obj.timestamp = Date.now();
    obj.instanceId = instanceId;
    obj.capsule = capsule;

    if(pubKeyRecovered === publicKey) {
        db.collection("encryptedObjects").insertOne(obj, function(err) {
            if(!err) {
                res.send(JSON.stringify({"message": "Object written successfully"}))
            } else {
                res.send(JSON.stringify({"error": "An Unknown Error Occured"}))
            }
        });
    } else {
        res.send(JSON.stringify({"error": "Invalid Signature"}))
    }
})

app.post("/writeKey", function (req, res) {
    let ownerPublicKey = req.body.ownerPublicKey;
    let reEncryptionKey = req.body.reEncryptionKey;
    let receiverPublicKey = req.body.receiverPublicKey;
    let signature = req.body.signature;

    let ownerPublicKey_hash = sha3.keccak256(ownerPublicKey);
    let hexToDecimal = (x) => ec.keyFromPrivate(x, "hex").getPrivate().toString(10);
    let pubKeyRecovered = ec.recoverPubKey(hexToDecimal(ownerPublicKey_hash), signature, signature.recoveryParam, "hex").encodeCompressed("hex");

    let obj = {};
    obj.ownerPublicKey = ownerPublicKey;
    obj.reEncryptionKey = reEncryptionKey;
    obj.receiverPublicKey = receiverPublicKey;
    obj.timestamp = Date.now();
    obj.instanceId = instanceId;

    if(ownerPublicKey === pubKeyRecovered) {
        db.collection("derivationKeys").insertOne(obj, function(err) {
            if(!err) {
                res.send(JSON.stringify({"message": "Key written successfully"}))
            } else {
                res.send(JSON.stringify({"error": "An Unknown Error Occured"}))
            }
        });
    } else {
        res.send(JSON.stringify({"error": "Invalid Signature"}))
    }
})

app.post("/deleteKey", function (req, res) {
    let ownerPublicKey = req.body.ownerPublicKey;
    let receiverPublicKey = req.body.receiverPublicKey;
    let signature = req.body.signature;

    let ownerPublicKey_hash = sha3.keccak256(ownerPublicKey);
    let hexToDecimal = (x) => ec.keyFromPrivate(x, "hex").getPrivate().toString(10);
    let pubKeyRecovered = ec.recoverPubKey(hexToDecimal(ownerPublicKey_hash), signature, signature.recoveryParam, "hex").encodeCompressed("hex");

    let obj = {};
    obj.ownerPublicKey = ownerPublicKey;
    obj.receiverPublicKey = receiverPublicKey;
    obj.instanceId = instanceId;

    if(ownerPublicKey === pubKeyRecovered) {
        db.collection("derivationKeys").deleteMany(obj, function(err) {
            if(!err) {
                res.send(JSON.stringify({"message": "Key deleted successfully"}))
            } else {
                res.send(JSON.stringify({"error": "An Unknown Error Occured"}))
            }
        });
    } else {
        res.send(JSON.stringify({"error": "Invalid Signature"}))
    }
})

app.post("/query", function(req, res) {
    let query = req.body.query;
    let signature = req.body.signature;
    let publicKey = req.body.publicKey;
    let ownerPublicKey = req.body.ownerPublicKey;

    let query_hash = sha3.keccak256(JSON.stringify(query));
    let hexToDecimal = (x) => ec.keyFromPrivate(x, "hex").getPrivate().toString(10);
    let pubKeyRecovered = ec.recoverPubKey(hexToDecimal(query_hash), signature, signature.recoveryParam, "hex").encodeCompressed("hex");

    if(publicKey === pubKeyRecovered) {
        query.instanceId = instanceId;

        if(ownerPublicKey === publicKey) {
            query.publicKey = ownerPublicKey;
            db.collection("encryptedObjects").find(query, {instanceId: 0}).sort({timestamp: 1}).toArray(function(err, result) {
                if(!err) {
                    res.send(JSON.stringify({queryResult: result}))
                } else {
                    res.send(JSON.stringify({"error": "An Unknown Error Occured"}))
                }
            })
        } else {
            db.collection("derivationKeys").findOne({instanceId: instanceId, ownerPublicKey: ownerPublicKey, receiverPublicKey: pubKeyRecovered}, function(err, result) {
                if(!err && result) {
                    let derivationKey = result.reEncryptionKey;
                    query.publicKey = ownerPublicKey;
                    db.collection("encryptedObjects").find(query, {instanceId: 0}).sort({timestamp: 1}).toArray(function(err, result) {
                        if(!err) {
                            res.send(JSON.stringify({derivationKey: derivationKey, queryResult: result}))
                        } else {
                            res.send(JSON.stringify({"error": "An Unknown Error Occured"}))
                        }
                    })
                } else {
                    res.send(JSON.stringify({"error": "An Unknown Error Occured"}))
                }
            })
        }


    } else {
        res.send(JSON.stringify({"error": "Invalid Signature"}))
    }
})

app.listen(7558, () => console.log("Impulse is running!!!"))

/*
let exec = require("child_process").exec;
var Wallet = require("ethereumjs-wallet");
let EthCrypto = require("eth-crypto");
let elliptic = require('elliptic');
let sha3 = require('js-sha3');
let ec = new elliptic.ec('secp256k1');

let alice_wallet = Wallet.generate();
let alice_private_key_hex = alice_wallet.getPrivateKey().toString("hex");
let alice_private_key_base64 = alice_wallet.getPrivateKey().toString("base64");
let alice_compressed_public_key_hex = EthCrypto.publicKey.compress(alice_wallet.getPublicKey().toString("hex"))
let alice_compressed_public_key_base64 = Buffer.from(EthCrypto.publicKey.compress(alice_wallet.getPublicKey().toString("hex")), 'hex').toString("base64")

let bob_wallet = Wallet.generate();
let bob_private_key_hex = bob_wallet.getPrivateKey().toString("hex");
let bob_private_key_base64 = bob_wallet.getPrivateKey().toString("base64");
let bob_compressed_public_key_hex = EthCrypto.publicKey.compress(bob_wallet.getPublicKey().toString("hex"))
let bob_compressed_public_key_base64 = Buffer.from(EthCrypto.publicKey.compress(bob_wallet.getPublicKey().toString("hex")), 'hex').toString("base64")

exec(`python3.6 ./crypto-operations/encrypt.py ${alice_compressed_public_key_base64} 'Hello World!!!'`, (error, stdout, stderr) => {
    if(!error) {
        stdout = stdout.split(" ")
        let ciphertext = stdout[0].substr(2).slice(0, -1)
        let capsule = stdout[1].substr(2).slice(0, -2)

        let ciphertext_hash = sha3.keccak256(ciphertext);
        let signature = ec.sign(ciphertext_hash, alice_private_key_hex, "hex", {canonical: true});
        let hexToDecimal = (x) => ec.keyFromPrivate(x, "hex").getPrivate().toString(10);
        let pubKeyRecovered = ec.recoverPubKey(hexToDecimal(ciphertext_hash), signature, signature.recoveryParam, "hex");

        console.log(pubKeyRecovered.encodeCompressed("hex") === alice_compressed_public_key_hex);

        exec('python3.6 ./crypto-operations/generate-re-encryptkey.py ' + alice_private_key_base64 + " " + bob_compressed_public_key_base64, (error, stdout, stderr) => {
            if(!error) {
                let kfrags = stdout

                exec("python3.6 ./crypto-operations/decrypt-pre.py '" + kfrags + "' " + capsule + " " + ciphertext + " " + bob_private_key_base64 + " " + bob_compressed_public_key_base64 + " " + alice_compressed_public_key_base64, (error, stdout, stderr) => {
                    if(!error) {
                        console.log(stdout)

                        exec('python3.6 ./crypto-operations/decrypt.py ' + alice_private_key_base64 + " " + alice_compressed_public_key_base64 + " " + capsule + " " + ciphertext, (error, stdout, stderr) => {
                            if(!error) {
                                console.log(stdout)
                            } else {
                                console.log(error)
                            }
                        })
                    } else {
                        console.log(error)
                    }
                })
            } else {
                console.log(error)
            }
        })
    } else {
        console.log(error)
    }
})
*/
/*
let alice_wallet = Wallet.generate();
let alice_private_key_hex = alice_wallet.getPrivateKey().toString("hex");
let alice_private_key_base64 = alice_wallet.getPrivateKey().toString("base64");
let alice_compressed_public_key_hex = EthCrypto.publicKey.compress(alice_wallet.getPublicKey().toString("hex"))
let alice_compressed_public_key_base64 = Buffer.from(EthCrypto.publicKey.compress(alice_wallet.getPublicKey().toString("hex")), 'hex').toString("base64")

let bob_wallet = Wallet.generate();
let bob_private_key_hex = bob_wallet.getPrivateKey().toString("hex");
let bob_private_key_base64 = bob_wallet.getPrivateKey().toString("base64");
let bob_compressed_public_key_hex = EthCrypto.publicKey.compress(bob_wallet.getPublicKey().toString("hex"))
let bob_compressed_public_key_base64 = Buffer.from(EthCrypto.publicKey.compress(bob_wallet.getPublicKey().toString("hex")), 'hex').toString("base64")

setTimeout(() => {
    let encodedPlainText = base64.encode("Hello World!!!");
    exec(`python3.6 ./crypto-operations/encrypt.py ${alice_compressed_public_key_base64} '${encodedPlainText}'`, (error, stdout, stderr) => {
        if(!error) {
            stdout = stdout.split(" ")
            let ciphertext = stdout[0].substr(2).slice(0, -1)
            let capsule = stdout[1].substr(2).slice(0, -2)

            let ciphertext_hash = sha3.keccak256(ciphertext);
            let signature = ec.sign(ciphertext_hash, alice_private_key_hex, "hex", {canonical: true});

            request({
                url: "http://localhost:7558/writeObject",
                method: "POST",
                json: {
                    publicKey: alice_compressed_public_key_hex,
                    encryptedData: ciphertext,
                    signature: signature,
                    metadata: {
                        assetName: "USD",
                        assetType: "Bulk"
                    },
                    capsule: capsule
                }
            }, (error, result, body) => {
                exec('python3.6 ./crypto-operations/generate-re-encryptkey.py ' + alice_private_key_base64 + " " + bob_compressed_public_key_base64, (error, stdout, stderr) => {
                    if(!error) {
                        let kfrags = stdout

                        let signature = ec.sign(sha3.keccak256(alice_compressed_public_key_hex), alice_private_key_hex, "hex", {canonical: true});
                        request({
                            url: "http://localhost:7558/writeKey",
                            method: "POST",
                            json: {
                                ownerPublicKey: alice_compressed_public_key_hex,
                                reEncryptionKey: kfrags,
                                signature: signature,
                                receiverPublicKey: bob_compressed_public_key_hex
                            }
                        }, (error, result, body) => {
                            let query = {
                                "metadata.assetName": "USD",
                                "metadata.assetType": "Bulk"
                            }

                            let signature = ec.sign(sha3.keccak256(JSON.stringify(query)), bob_private_key_hex, "hex", {canonical: true});

                            request({
                                url: "http://localhost:7558/query",
                                method: "POST",
                                json: {
                                    query: query,
                                    signature: signature,
                                    publicKey: bob_compressed_public_key_hex,
                                    ownerPublicKey: alice_compressed_public_key_hex
                                }
                            }, (error, result, body) => {
                                console.log(body)
                            })
                        })
                    } else {
                        console.log(error)
                    }
                })
            })
        } else {
            console.log(error)
        }
    })
}, 2000)
*/
