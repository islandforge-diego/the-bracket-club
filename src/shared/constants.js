export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const FULL   = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const COLORS = ["#c0392b","#8e44ad","#2980b9","#16a085","#d35400","#27ae60","#e74c3c","#f39c12","#1abc9c","#e67e22","#9b59b6","#2ecc71"];

export const R1 = [
  { id:"r1_jf", label:"Jan vs Feb",  m1:0,  m2:1  },
  { id:"r1_ma", label:"Mar vs Apr",  m1:2,  m2:3  },
  { id:"r1_mj", label:"May vs Jun",  m1:4,  m2:5  },
  { id:"r1_ja", label:"Jul vs Aug",  m1:6,  m2:7  },
  { id:"r1_so", label:"Sep vs Oct",  m1:8,  m2:9  },
  { id:"r1_nd", label:"Nov vs Dec",  m1:10, m2:11 },
];

export const R2 = [
  { id:"r2_a", label:"Round 2", p1:"r1_jf", p2:"r1_ma" },
  { id:"r2_b", label:"Round 2", p1:"r1_mj", p2:"r1_ja" },
  { id:"r2_c", label:"Round 2", p1:"r1_so", p2:"r1_nd" },
];

export const MATCHES = [...R1, ...R2];
