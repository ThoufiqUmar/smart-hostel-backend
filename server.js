const express = require("express")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

let systemState = {

solar:0,
battery:50,
grid:true,
prediction:0,
load:0,

rooms:Array(30).fill().map((_,i)=>({

id:i+1,
irms:0,
pf:1,
thd:0,
device:"Normal",
supply:true

}))

}

// ESP32 UPDATE
app.post("/update",(req,res)=>{

const data=req.body

// SYSTEM DATA
if(data.solar!==undefined)
systemState.solar=data.solar

if(data.battery!==undefined)
systemState.battery=data.battery

if(data.grid!==undefined)
systemState.grid=data.grid

if(data.prediction!==undefined)
systemState.prediction=data.prediction

if(data.load!==undefined)
systemState.load=data.load


// ROOM DATA
if(data.rooms){

data.rooms.forEach(room=>{

let r=room.id-1

systemState.rooms[r].irms=room.irms
systemState.rooms[r].pf=room.pf
systemState.rooms[r].thd=room.thd
systemState.rooms[r].device=room.device
systemState.rooms[r].supply=room.supply

})

}

res.json({status:"updated"})

})

// DASHBOARD REQUEST
app.get("/status",(req,res)=>{

res.json(systemState)

})

const PORT=process.env.PORT||3000

app.listen(PORT,()=>{

console.log("Smart Hostel API running")

})