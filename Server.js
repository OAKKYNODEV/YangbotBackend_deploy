import express, { response } from 'express'
import mysql from 'mysql'
import core from 'cors'
import cookieParser from 'cookie-parser'
import jsonParser from 'json-parser'
import bodyParser from 'body-parser'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import multer from "multer"
import path from "path"
import readXlsxFile from 'read-excel-file/node'
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();


const app =express();
app.use(core(
    {
        origin:["http://158.108.101.25"],
        methods:["POST","GET","PUT","DELETE"],
        credentials: true
    }
));
app.use(cookieParser());
app.use(express.json());
app.use(express.static('public'));

const con =  mysql.createConnection(process.env.DATABASE_URL);

const storage = multer.diskStorage({
    destination:(req,file, cb) => {
        cb(null,"public/images")
    },
    filename:(req,file,cb) => {
      const timestamp = Date.now(); // สร้าง timestamp
      const extname = path.extname(file.originalname); // ดึงนามสกุลของไฟล์
      cb(null, `${timestamp}${extname}`); // ตั้งชื่อไฟล์ใหม่เป็น timestamp.ext
    }
})


  
const upload = multer({
    storage: storage
})

app.post('/import-excel', upload.single('import-excel'), (req, res) => {
  const excelFilePath = req.file.path;

  // อ่านไฟล์ Excel และบันทึกข้อมูลลงใน MySQL
  readXlsxFile(excelFilePath).then((rows) => {
      // วนลูปผ่านแต่ละแถวข้อมูล
      for (let i = 1; i < rows.length; i++) { // เริ่มที่ดัชนี 1 เพื่อข้ามบรรทัดแรก
          const row = rows[i];
          const [username, email, password, fname, lname, age, phone, lineid, work, image ] = row;

          // บันทึกข้อมูลใน MySQL
          const sql = `INSERT INTO webapp_researcher (username, email, password, fname, lname, age, phone, lineid, work, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
          const values = [username, email, password, fname, lname, age, phone, lineid, work, image];

          con.query(sql, values, (err, result) => {
              if (err) {
                  console.error("Error inserting data into MySQL:", err);
                  // ในกรณีเกิดข้อผิดพลาดในการบันทึกข้อมูลใน MySQL คุณสามารถจัดการข้อผิดพลาดนี้ตามความต้องการ
              } else {
                  console.log("Data inserted successfully into MySQL");
              }
          });
      }

      // ลบไฟล์ Excel หลังจากอ่านและบันทึกข้อมูลเสร็จสิ้น
      fs.unlinkSync(excelFilePath);

      res.status(200).json({ message: 'Excel uploaded and data saved successfully' });
  }).catch((error) => {
      console.error("Error reading Excel file:", error);
      // ในกรณีเกิดข้อผิดพลาดในการอ่านไฟล์ Excel คุณสามารถจัดการข้อผิดพลาดนี้ตามความต้องการ
      res.status(500).json({ error: 'Internal Server Error' });
  });
});


con.connect(function(err){
    if(err) {
        console.log("Error in  Conection")
    } else {
        console.log("Conected")
    }
})




app.get('/get/:id', (req, res) => {  //ใช้เพื่อแสดงข้อมูลเดิมใน textfield
    const id = req.params.id;
    const sql = "SELECT * FROM webapp_researcher where id = ?";
    con.query(sql, [id], (err, result) => {
        if(err) return res.json({Error: "Get employee error in sql"});
        return res.json({Status: "Success", Result: result})
    })
})

app.put('/update/:id', (req, res) => {  //แก้ไขข้อมูล
    const id = req.params.id;
    const sql = "UPDATE webapp_researcher set email = ?, username = ?, fname = ? , lname = ?, age = ?, phone = ?, lineid = ?, work = ? WHERE id = ?";
    con.query(sql, [req.body.email,req.body.username,req.body.fname,req.body.lname,req.body.age,req.body.phone,req.body.lineid,req.body.work, id], (err, result) => {
        if(err) return res.json({Error: "update employee error in sql"});
        return res.json({Status: "Success"})
    })
})

app.delete('/delete/:id', (req,res) => {
    const id = req.params.id;
    const sql = "Delete from webapp_visitor where id = ?";
    con.query(sql, [id], (err, result) => {
        if(err) return res.json({Error: "Delete employee error in sql"});
        return res.json({Status: "Success", Result: result})
    })
})

const verifyUser = (req,res,next) => {
    const token = req.cookies.token;
    if(!token) {
        return res.json({Error:"You are not Authenicated"});
    } else {
        jwt.verify(token,"jwt-secret-key",(err,decoded) => {
            if(err) return res.json({Error:"Token Wrong"});
            req.role = decoded.role;
            req.id = decoded.id;
            next();
        })
    }
} 

app.get('/dashboard',verifyUser, (req,res) => {
    return res.json({Status:"Success", role: req.role, id:req.id})
})

app.get('/adminCount', (req,res) => {
    const sql = "SELECT count(id) as admin from users";
    con.query(sql, (err,result) => {
        if(err) return res.json({Error:"Error in runing query"});
        return res.json(result)
         })
    })

app.get('/visitorCount', (req,res) => {
    const sql = "SELECT count(id) as visitor from webapp_visitor";
    con.query(sql, (err,result) => {
        if(err) return res.json({Error:"Error in runing query"});
        return res.json(result)
         })
    })    

app.get('/job', (req,res) => {
    const sql = "SELECT sum(job) as sumjob from webapp_visitor";
    con.query(sql, (err,result) => {
        if(err) return res.json({Error:"Error in runing query"});
        return res.json(result)
         })
    })     
    
// ออกจากระบบ
app.get('/logout', (req,res) => {
    res.clearCookie ('token');
    return res.json({Status:"Success"});
})

//แอดมิน login
app.post('/login', (req,res) => {
    const sql ="SELECT * FROM webapp_admin WHERE email  = ? AND password = ?";
    con.query(sql, [req.body.email, req.body.password], (err, result) => {
        if(err) return res.json({Status:"Error", Error:"Error in runing query"});
        if(result.length > 0){
            const id = result[0].id;
            const token = jwt.sign({role:"admin"},"jwt-secret-key", {expiresIn:'1d'});
            res.cookie('token',token);
            return res.json({Status:"Success"})
        } else {
            return res.json({Status:"Error", Error: "บัญชีผู้ใช้งานไม่ถูกต้อง"});
        }
    })
})

//นักวิจัย login
app.post('/test', (req, res) => {
    const sql = "SELECT * FROM webapp_researcher Where email = ?";
    con.query(sql, [req.body.email], (err, result) => {
        if(err) return res.json({Status: "Error", Error: "Error in runnig query"});
        if(result.length > 0) {
            bcrypt.compare(req.body.password.toString(), result[0].password, (err, response)=> {
                if(err) return res.json({Error: "password error"});
                if(response) {
                    const token = jwt.sign({role: "visitor", id: result[0].id}, "jwt-secret-key", {expiresIn: '1d'});
                    res.cookie('token', token);
                    return res.json({Status: "Success", id: result[0].id})
                } else {
                    return res.json({Status: "Error", Error: "บัญชีผู้ใช้งานไม่ถูกต้อง"});
                }
                
            })
            
        } else {
            return res.json({Status: "Error", Error: "Wrong Email or Password"});
        }
    })
})
app.post('/researcherlogin', (req,res) => {
  const sql ="SELECT * FROM webapp_researcher WHERE email  = ? AND password = ?";
  con.query(sql, [req.body.email, req.body.password], (err, result) => {
      if(err) return res.json({Status:"Error", Error:"Error in runing query"});
      if(result.length > 0){
          const id = result[0].id;
          const token = jwt.sign({role:"visitor"},"jwt-secret-key", {expiresIn:'1d'});
          res.cookie('token',token);
          return res.json({Status:"Success"})
      } else {
          return res.json({Status:"Error", Error: "บัญชีผู้ใช้งานไม่ถูกต้อง"});
      }
  })
})
 //สมัครสมาชิก
//app.post('/createvisitor', (req,res) => {
  //const sql ="INSERT INTO webapp_visitor (`username`,`email`,`password`,`fname`,`lname`,`age`,`phone`,`work`,`form`) VALUES (?)";
  //bcrypt.hash(req.body.password.toString(),10,(err,hash) => {
    //  if(err) return res.json({Error: "Error in hashing password"});
      //const values =  [
        //  req.body.username,
          //req.body.email,
          //hash,
          //req.body.fname,
          //req.body.lname,
          //req.body.age,
          //req.body.phone,
          //req.body.work,
          //req.body.form
      //]
      //con.query(sql, [values],(err,result) => {
         // if(err) return res.json({Err:"Inside singup query"});
         // return res.json({Status:"Success"});
      //})
  //})
//})

//อัพโหลดรูปภาพเข้าbackend
app.post('/uploadimg', upload.single('image'), (req, res) => {
  const sql = "INSERT INTO webapp_uploadimg (`date`, `img_name`) VALUES (?, ?)";
  const values = [
    new Date(), // เพิ่มวันที่ปัจจุบัน
    req.file.filename,
  ];
  con.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error in signup query:", err);
      return res.status(500).json({ Err: "Internal Server Error" });
    }
    return res.json({ Status: "Success" });
  });
});

//สร้างบัญชีนักวิจัย
app.post('/create', upload.single('image'), (req, res) => {
  const sql = "INSERT INTO webapp_researcher (`username`,`email`,`password`,`fname`,`lname`,`age`,`phone`,`lineid`,`work`,image) VALUES (?)";
  const values = [
      req.body.username,
      req.body.email,
      req.body.password, // ไม่ hash รหัสผ่าน
      req.body.fname,
      req.body.lname,
      req.body.age,
      req.body.phone,
      req.body.lineid,
      req.body.work,
      req.file.filename,
  ]
  con.query(sql, [values], (err, result) => {
      if (err) return res.json({ Err: "Inside singup query" });
      return res.json({ Status: "Success" });
  });
})



                                    // API จากอันเดิม //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/linebot_image', (req, res) => {
    const sql = "SELECT COUNT(*) AS imageCount FROM linebot_image WHERE link_image IS NOT NULL";
    con.query(sql, (err, result) => {
      if (err) return res.json(err);
      const imageCount = result[0].imageCount;
      return res.json({ count: imageCount });
    });
  });
  
  app.get('/linebot_log', (req, res) => {
    const messageType = 'TextMessage';
    const sql = "SELECT Questiontype ,COUNT(*) AS Count FROM linebot_log WHERE MessageType = ? ";
    con.query(sql,messageType, (err, result) => {
      if (err) return res.json(err);
      const Count = result[0].Count;
      return res.json({ count: Count });
    });
  });
  
  
  
  app.get('/linebot_log_count', (req, res) => {
    const messageType = 'TextMessage';
  
    const sql = 'SELECT QuestionType, COUNT(*) AS QuestionTypeCount FROM linebot_log WHERE MessageType = ? GROUP BY QuestionType;';
    
    con.query(sql, messageType, (err, data) => {
      if (err) return res.json(err);
  
      const result = [];
  
      // แปลงข้อมูลจาก MySQL ให้เป็นรูปแบบที่ต้องการ
      data.forEach((row) => {
        result.push({
          QuestionType: row.QuestionType,
          QuestionTypeCount: row.QuestionTypeCount
        });
      });
  
      return res.json(result);
    });
  });
  
  
  
  
  app.get('/webapp_uploadimg_count', (req, res) => {
    const sql = "SELECT COUNT(*) AS imageCount FROM webapp_uploadimg WHERE img_name IS NOT NULL";
    con.query(sql, (err, result) => {
      if (err) return res.json(err);
      const imageCount = result[0].imageCount;
      return res.json({ count: imageCount });
    });
  });
  
  app.get('/webapp_researcher_count', (req, res) => {
    const sql = "SELECT COUNT(*) AS imageCount FROM webapp_researcher WHERE email IS NOT NULL";
    con.query(sql, (err, result) => {
      if (err) return res.json(err);
      const imageCount = result[0].imageCount;
      return res.json({ count: imageCount });
    });
  });
  
  app.get('/linebot_log2', (req, res) => {
    const messageType = 'TextMessage';
  
    const sql = 'SELECT  id,DisplayName, Date, Time, Message,QuestionType FROM linebot_log WHERE MessageType = ?';
    con.query(sql, messageType, (err, data) => {
      if(err) return res.json(err); 
      return res.json(data);
    })
  })
  
  app.get('/userlog',(req, res) =>{
    const sql = "SELECT * FROM webapp_researcher";
    con.query(sql,(err, data) => {
      if(err) return res.json(err); 
      return res.json(data);
    })
  })
  
  

  app.put('/updatequestion/:id', (req, res) => {
    const sql = "UPDATE linebot_log SET QuestionType = ? WHERE id = ?";
    const values = [
      req.body.QuestionType, // แก้ชื่อตัวแปรจาก QuetionType เป็น QuestionType
      req.params.id
    ];
  
    con.query(sql, values, (err, data) => {
      if (err) return res.json("Error");
      return res.json(data);
    });
  });
  
  
  app.post('/usercreate', function (req, res, next){
    const id = req.params.id;
    con.query(  
      'INSERT INTO webapp_users (email,password,fname,lname,age,phone,lineid,role) VALUES (?,?,?,?,?,?,?,?)' ,
      [req.body.email,req.body.password,req.body.fname,req.body.lname,req.body.age,req.body.phone,req.body.lineid,req.body.role],
      function(err,results) {
        if (err) {
          res.json({status: 'error',message:err})
          return
        }
        res.json ({status: 'ok'})
      }
    );  
  })
  
  
  
  app.delete('/userdel/:id', function (req, res, next){
      const sql ="DELETE FROM webapp_researcher WHERE id = ?"
      const id = req.params.id;
  
      con.query (sql, [id], (err, data) => {
        if(err) return res.json("Error");
        return res.json(data);
      })
  });
  
  app.get('/tableimg',(req, res) =>{
    const sql = "SELECT * FROM linebot_image";
    con.query(sql,(err, data) => {
      if(err) return res.json(err); 
      return res.json(data);
    })
  })
  
  app.get('/barimg', (req, res) => {
    const sql = "SELECT * FROM linebot_image";
    con.query(sql, (err, data) => {
      if (err) return res.json(err);
  
      // สร้างอาร์เรย์ของอ็อบเจ็กต์ JSON โดยเพิ่ม "count" ในแต่ละอ็อบเจ็กต์
      const responseData = data.map(item => ({
        ...item,
        count: data.length
      }));
  
      // ส่งข้อมูล JSON กลับไป
      return res.json(responseData);
    });
  });
  
  app.get('/publicimg', (req, res) => {
    // ดึงข้อมูลรูปภาพจาก SQL
    con.query('SELECT img_name FROM webapp_uploadimg', (error, results) => {
      if (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch image names from database' });
      } else {
        const images = results.map((row) => {
          return {
            name: row.img_name,
            // สร้าง URL สำหรับแสดงรูปภาพจากเซิร์ฟเวอร์ Express.js
            url: `http://localhost:3333/images/${row.img_name}`
          };
        });
        res.json({ images: images });
      }
    });
  });


app.listen(process.env.PORT || 3333)
con.end()