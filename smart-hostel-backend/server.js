const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")

const app = express()

app.use(cors())
app.use(bodyParser.json())

let systemState = {
  solar:0,
  battery:50,
  grid:1,
  rooms:Array(30).fill().map((_,i)=>({
    id:i+1,
    irms:0,
    pf:1,
    thd:0,
    supply:true
  }))
}

app.post("/update",(req,res)=>{

  const data = req.body

  if(data.room){

    let r = data.room-1

    systemState.rooms[r].irms=data.irms
    systemState.rooms[r].pf=data.pf
    systemState.rooms[r].thd=data.thd
    systemState.rooms[r].supply=data.supply
  }

  res.json({status:"ok"})
})

app.get("/status",(req,res)=>{

  res.json(systemState)

})

const PORT = process.env.PORT || 3000

app.listen(PORT,()=>{

  console.log("Server running")

})