---
title: "物理引擎开发-Integrator的探索(1)"
date: 2026-07-16T02:50:00+08:00
draft: false
tags: []
categories: ["tech"]
summary: ""
cover: ""
comments: true
math: true
---

# 物理引擎开发-Integrator的探索(1)

在最开始设计积分器时，我把微分方程理解为一种很窄的形式：

\[
y'=f(t,y)
\]

因此最初的接口也自然写成类似：

```cpp
using Fn = double(*)(double, double);
```

这种接口可以处理一个标量一阶常微分方程，但很快就会遇到限制。

例如最简单的弹簧振子、单摆或质点动力学，通常都包含二阶导数：

\[
x''=f(t,x,x')
\]

而多个相互耦合的质点、刚体、连续介质离散模型，则会进一步形成高维系统。

经过这一轮推导，我逐渐意识到：

> 数值积分器真正应该处理的对象，不是某个特定阶数的微分方程，而是一个随时间演化的状态。

换句话说，积分器的统一接口应当是：

\[
\boxed{
\mathbf y'=\mathbf f(t,\mathbf y)
}
\]

其中 \(\mathbf y\) 可以是标量、向量，也可以是空间离散之后形成的数千维状态。

这篇文章记录我从二阶方程出发，逐步理解状态空间、高阶 ODE、非线性方程、PDE 半离散、刚性、隐式系统、辛积分器，以及哈密顿结构的过程。

---

## 1. 从二阶微分方程到一阶状态方程

考虑常系数二阶方程：

\[
ax''+bx'+cx=0,\qquad a\neq0
\]

定义状态变量：

\[
y_1=x,\qquad y_2=x'
\]

于是：

\[
\mathbf y=
\begin{bmatrix}
y_1\\
y_2
\end{bmatrix}
=
\begin{bmatrix}
x\\
x'
\end{bmatrix}
\]

逐个对状态变量求导：

\[
y_1'=x'=y_2
\]

原方程可以解出：

\[
x''=-\frac ca x-\frac ba x'
\]

因此：

\[
y_2'
=
-\frac ca y_1-\frac ba y_2
\]

组合起来：

\[
\boxed{
\mathbf y'
=
\begin{bmatrix}
0&1\\
-\frac ca&-\frac ba
\end{bmatrix}
\mathbf y
}
\]

最初我曾尝试直接写：

\[
\begin{bmatrix}0&1\end{bmatrix}\mathbf y'
=
\begin{bmatrix}-c/a&-b/a\end{bmatrix}\mathbf y
\]

这个式子本身没有错，因为它确实提取出了：

\[
y_2'=x''
\]

但左侧的 \([0,1]\) 只是一个选择矩阵，只给出了状态导数中的一个分量。

缺失的另一行来自状态定义本身：

\[
y_1'=y_2
\]

也就是：

\[
\begin{bmatrix}1&0\end{bmatrix}\mathbf y'
=
\begin{bmatrix}0&1\end{bmatrix}\mathbf y
\]

把两行叠起来，左边才成为单位矩阵：

\[
\begin{bmatrix}
1&0\\
0&1
\end{bmatrix}\mathbf y'
=
\begin{bmatrix}
0&1\\
-\frac ca&-\frac ba
\end{bmatrix}\mathbf y
\]

这一步揭示了高阶方程降阶的本质：

> 除了原微分方程本身，还必须把各阶导数之间的定义关系写入状态方程。

---

## 2. 更高阶方程只是继续扩充状态

考虑三阶方程：

\[
ax'''+bx''+cx'+dx+e=0
\]

定义：

\[
\mathbf y=
\begin{bmatrix}
x\\
x'\\
x''
\end{bmatrix}
\]

那么：

\[
\mathbf y'
=
\begin{bmatrix}
x'\\
x''\\
x'''
\end{bmatrix}
\]

前两行来自状态定义：

\[
y_1'=y_2,\qquad y_2'=y_3
\]

最后一行由原方程给出：

\[
x'''
=
-\frac da x
-\frac ca x'
-\frac ba x''
-\frac ea
\]

因此：

\[
\boxed{
\mathbf y'
=
\begin{bmatrix}
0&1&0\\
0&0&1\\
-\frac da&-\frac ca&-\frac ba
\end{bmatrix}
\mathbf y
+
\begin{bmatrix}
0\\
0\\
-\frac ea
\end{bmatrix}
}
\]

一般地，对于：

\[
a_nx^{(n)}
+a_{n-1}x^{(n-1)}
+\cdots
+a_1x'
+a_0x
=r(t)
\]

定义：

\[
\mathbf y=
\begin{bmatrix}
x\\
x'\\
\vdots\\
x^{(n-1)}
\end{bmatrix}
\]

就可以得到：

\[
\boxed{
\mathbf y'=A\mathbf y+\mathbf g(t)
}
\]

其中 \(A\) 的前 \(n-1\) 行是简单的移位结构，最后一行由原方程系数决定。

因此，高阶 ODE 并不要求设计“二阶积分器”“三阶积分器”或“六阶积分器”。

真正统一的积分器只需要处理：

\[
\mathbf y'=\mathbf f(t,\mathbf y)
\]

状态维度由模板参数或向量类型决定。

---

## 3. Euler 与 RK4 根本不关心状态有几维

显式 Euler 的统一形式是：

\[
\boxed{
\mathbf y_{n+1}
=
\mathbf y_n+h\mathbf f(t_n,\mathbf y_n)
}
\]

经典四阶 Runge-Kutta 为：

\[
\begin{aligned}
\mathbf k_1&=\mathbf f(t_n,\mathbf y_n)\\
\mathbf k_2&=\mathbf f\left(t_n+\frac h2,\mathbf y_n+\frac h2\mathbf k_1\right)\\
\mathbf k_3&=\mathbf f\left(t_n+\frac h2,\mathbf y_n+\frac h2\mathbf k_2\right)\\
\mathbf k_4&=\mathbf f(t_n+h,\mathbf y_n+h\mathbf k_3)
\end{aligned}
\]

然后：

\[
\boxed{
\mathbf y_{n+1}
=
\mathbf y_n+
\frac h6
\left(
\mathbf k_1+2\mathbf k_2+2\mathbf k_3+\mathbf k_4
\right)
}
\]

这里的 \(\mathbf y\) 可以是二维、三维，也可以是一千维。

因此 C++ 中更合理的接口是：

```cpp
template <typename State, typename RHS>
State rk4Step(
    double t,
    const State& y,
    double h,
    RHS&& rhs)
{
    const State k1 = rhs(t, y);
    const State k2 = rhs(t + h / 2.0, y + h * k1 / 2.0);
    const State k3 = rhs(t + h / 2.0, y + h * k2 / 2.0);
    const State k4 = rhs(t + h, y + h * k3);

    return y + h * (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0;
}
```

只要 `State` 支持：

- 同类型相加；
- 标量乘法；
- `rhs(t, y)` 返回相同状态类型；

这个积分器就可以处理任意有限维显式 ODE。

---

## 4. 为什么导数函数通常叫 RHS

显式 ODE 的标准形式是：

\[
\mathbf y'=\mathbf f(t,\mathbf y)
\]

左边是状态导数，右边是由当前状态和时间决定的函数。

所以代码中通常把这个函数叫做：

```cpp
rhs(t, y)
```

即 right-hand side。

例如线性系统：

\[
\mathbf y'=A\mathbf y+\mathbf b(t)
\]

其中矩阵 \(A\) 不是完整的 RHS。

完整 RHS 是：

\[
\boxed{
A\mathbf y+\mathbf b(t)
}
\]

代码中对应：

```cpp
State rhs(double t, const State& y)
{
    return A * y + forcing(t);
}
```

而：

```cpp
State dydt = rhs(t, y);
```

中，`rhs` 是计算函数，`dydt` 是它在当前状态下返回的导数向量。

---

## 5. 非线性并不会破坏统一形式

考虑不做小角度近似的单摆：

\[
\theta''
=
-\frac gl\sin\theta
\]

再加入二次阻力：

\[
\theta''
=
-\frac gl\sin\theta
-\gamma\theta'|\theta'|
\]

定义：

\[
y_1=\theta,\qquad y_2=\omega=\theta'
\]

则：

\[
\boxed{
\mathbf y'
=
\begin{bmatrix}
y_2\\
-\dfrac gl\sin y_1-\gamma y_2|y_2|
\end{bmatrix}
}
\]

虽然它不能再写成固定矩阵：

\[
\mathbf y'=A\mathbf y
\]

但仍然是完全合法的：

\[
\mathbf y'=\mathbf f(\mathbf y)
\]

所以 Euler、RK4 并不要求系统线性。

它们只要求右端函数能够在给定状态下算出导数。

---

## 6. 什么时候才真正变成隐式方程

如果最高阶导数也出现在系数内部，例如：

\[
a(t,x^{(n)})x^{(n)}
+
b(t,x,\ldots,x^{(n-1)})=0
\]

令：

\[
z=x^{(n)}
\]

那么最后一个状态导数不再能够直接写成显式函数，而是由代数方程决定：

\[
\boxed{
G(t,\mathbf y,z)=0
}
\]

如果满足：

\[
\frac{\partial G}{\partial z}\neq0
\]

则根据隐函数定理，局部可以写成：

\[
z=\phi(t,\mathbf y)
\]

此时仍能包装成普通 RHS：

\[
\mathbf f(t,\mathbf y)
=
\begin{bmatrix}
y_2\\
\vdots\\
\phi(t,\mathbf y)
\end{bmatrix}
\]

只不过每次计算 RHS 时，都需要先通过 Newton 法等方法求解最高阶导数。

如果：

\[
\frac{\partial G}{\partial z}\approx0
\]

则会出现：

- 根对状态极度敏感；
- 多个根合并；
- Newton 迭代失败；
- 分支跳跃；
- 显式状态表达退化。

此时更自然的形式是：

\[
\boxed{
F(t,\mathbf y,\mathbf y')=0
}
\]

这已经属于隐式 ODE 或 DAE 的范畴，需要后向 Euler、BDF、Radau 等隐式方法。

---

## 7. 变系数、病态与刚性

变系数本身不会破坏高阶方程的移位结构。

例如：

\[
a(t)x'''+b(t)x''+c(t)x'+d(t)x+e(t)=0
\]

状态方程仍然是：

\[
\mathbf y'
=
\begin{bmatrix}
0&1&0\\
0&0&1\\
-\dfrac{d(t)}{a(t)}
&
-\dfrac{c(t)}{a(t)}
&
-\dfrac{b(t)}{a(t)}
\end{bmatrix}\mathbf y
+
\begin{bmatrix}
0\\
0\\
-\dfrac{e(t)}{a(t)}
\end{bmatrix}
\]

真正的问题是最高阶系数是否接近零。

例如：

\[
\varepsilon x''+x'+x=0,\qquad 0<\varepsilon\ll1
\]

化成状态方程后会出现 \(1/\varepsilon\)：

\[
\mathbf y'
=
\begin{bmatrix}
0&1\\
-\frac1\varepsilon&-\frac1\varepsilon
\end{bmatrix}\mathbf y
\]

这会产生相差很大的时间尺度。

系统中某些模态变化很快，另一些模态变化很慢。这类问题称为刚性问题。

显式 RK 即使理论精度很高，也可能因为稳定性要求被迫使用极小步长。

因此：

\[
\boxed{
\text{高阶方程降阶只统一了形式，并没有自动解决刚性与病态}
}
\]

---

## 8. 步长越小，误差并不一定无限下降

在精确算术中，一个 \(p\) 阶方法的截断误差通常满足：

\[
E_{\text{trunc}}\sim C_th^p
\]

所以减小 \(h\) 会降低截断误差。

但计算机使用浮点数，步长越小，迭代次数越多，舍入误差会不断累计。

总误差可粗略理解为：

\[
\boxed{
E(h)
\approx
C_th^p
+
C_r\frac{\varepsilon_{\text{mach}}}{h}
}
\]

第一项随 \(h\) 减小而降低，第二项随 \(h\) 减小而增大。

因此误差曲线往往是 U 形的：

- 步长太大：截断误差主导；
- 步长适中：总误差最小；
- 步长极小：舍入误差和消去误差主导。

这意味着：

> 更小的步长不一定更好，合理步长需要同时考虑稳定性、截断误差和浮点精度。

---

## 9. 从多质点 ODE 到连续介质 PDE

设一串质点通过弹簧连接。

第 \(i\) 个质点的位移为：

\[
x_i(t)
\]

相邻质点平衡间距为 \(a\)。

内部质点满足：

\[
m\ddot x_i
=
k(x_{i+1}-2x_i+x_{i-1})
\]

这仍然只是一个大量耦合的 ODE 系统。

现在定义连续位移场：

\[
u(x,t)
\]

表示位于空间坐标 \(x\) 处的材料点在时刻 \(t\) 的位移。

第 \(i\) 个质点的平衡位置是：

\[
x=ia
\]

因此：

\[
\boxed{
x_i(t)=u(ia,t)
}
\]

这句话只是说：离散质点的位移，是连续位移场在离散空间位置上的采样值。

于是：

\[
x_{i+1}-2x_i+x_{i-1}
\]

对应：

\[
u(x+a,t)-2u(x,t)+u(x-a,t)
\]

而空间二阶导数的中心差分是：

\[
u_{xx}(x,t)
\approx
\frac{
u(x+a,t)-2u(x,t)+u(x-a,t)
}{a^2}
\]

所以离散弹簧链在连续极限下变成：

\[
m u_{tt}=ka^2u_{xx}
\]

即：

\[
\boxed{
u_{tt}=c^2u_{xx}
}
\]

其中：

\[
c=a\sqrt{\frac{k}{m}}
\]

这就是一维波动方程。

---

## 10. PDE 也可以通过升维变成 ODE

对于：

\[
u_{tt}=c^2u_{xx}
\]

先定义速度场：

\[
v(x,t)=u_t(x,t)
\]

得到：

\[
\begin{cases}
u_t=v\\
v_t=c^2u_{xx}
\end{cases}
\]

形式上，这已经是一个一阶时间演化系统。

但此时状态不是有限维向量，而是两整条函数：

\[
u(\cdot,t),\qquad v(\cdot,t)
\]

可以把它理解为一个无限维状态系统。

为了交给普通 ODE 积分器，需要在空间上离散：

\[
x_i=i\Delta x
\]

定义：

\[
u_i(t)=u(x_i,t),\qquad v_i(t)=v(x_i,t)
\]

于是：

\[
u_i'=v_i
\]

\[
v_i'
=
c^2
\frac{u_{i+1}-2u_i+u_{i-1}}{\Delta x^2}
\]

将所有空间点拼成一个大状态：

\[
\mathbf Y=
\begin{bmatrix}
u_0\\
u_1\\
\vdots\\
u_{N-1}\\
v_0\\
v_1\\
\vdots\\
v_{N-1}
\end{bmatrix}
\]

就再次得到：

\[
\boxed{
\mathbf Y'=\mathbf F(t,\mathbf Y)
}
\]

这种方法称为线法：

\[
\boxed{
\text{Method of Lines}
}
\]

即：

1. 先离散空间；
2. 保留时间连续；
3. 把 PDE 变成高维 ODE；
4. 再交给时间积分器。

这让我形成了一个非常统一的认识：

\[
\boxed{
\text{高阶 ODE：通过增加状态维度换取一阶形式}
}
\]

\[
\boxed{
\text{PDE：通过空间离散换取有限维状态形式}
}
\]

---

## 11. “通过维度换取形式”

这次讨论中最重要的总结之一是：

\[
\boxed{
\text{通过扩充状态维度，换取统一的一阶时间演化形式}
}
\]

例如：

### 二阶 ODE

\[
x''=f(t,x,x')
\]

变成：

\[
\begin{cases}
x'=v\\
v'=f(t,x,v)
\end{cases}
\]

### 多变量系统

\[
\begin{cases}
x'=f_1(t,x,y,z)\\
y'=f_2(t,x,y,z)\\
z'=f_3(t,x,y,z)
\end{cases}
\]

变成：

\[
\mathbf Y'
=
\begin{bmatrix}
f_1\\
f_2\\
f_3
\end{bmatrix}
\]

### PDE 空间离散

\[
u_{tt}=c^2u_{xx}
\]

变成一个 \(2N\) 维的一阶 ODE 系统。

因此，真正统一的对象是：

\[
\boxed{
\text{有限维连续时间状态系统}
}
\]

而 PDE 求解器，可以理解为在这个通用积分器前面增加一层空间离散器。

---

## 12. “能够表示”不等于“能够可靠求解”

从形式上看，很多确定性动力系统最终都能写成：

\[
\mathbf y'=\mathbf f(t,\mathbf y)
\]

或者：

\[
F(t,\mathbf y,\mathbf y')=0
\]

但这并不意味着使用同一个 RK4 就可以可靠地“求解万物”。

真正需要考虑的还包括：

- 模型误差；
- 时间离散误差；
- 空间离散误差；
- 非线性迭代误差；
- 舍入误差；
- 刚性；
- 稳定性；
- 收敛性；
- 约束漂移；
- 守恒律；
- 碰撞和事件；
- 混沌系统的初值敏感性。

总误差可以粗略拆成：

\[
\boxed{
\text{总误差}
=
\text{模型误差}
+
\text{离散误差}
+
\text{迭代误差}
+
\text{舍入误差}
}
\]

积分器只是整个数值求解链条中的一部分。

---

---

## 13. 本篇总结

这一阶段的探索，核心不是某个具体积分公式，而是建立一个统一的建模视角：

\[
\boxed{
\text{高阶 ODE}
\longrightarrow
\text{扩充状态}
\longrightarrow
\mathbf y'=\mathbf f(t,\mathbf y)
}
\]

对于 PDE，则可以先离散空间，再得到高维 ODE：

\[
\boxed{
\text{PDE}
\longrightarrow
\text{空间离散}
\longrightarrow
\mathbf Y'=\mathbf F(t,\mathbf Y)
}
\]

这让 Integrator 的职责变得清晰：

- 模型负责定义状态和 RHS；
- 积分器负责推进时间；
- 数值分析负责判断稳定性、收敛性与误差；
- 更复杂的问题还需要处理刚性、隐式约束和 DAE。

因此，物理引擎中的 Integrator 不应被设计成“某个二阶方程的求解器”，而应被设计成：

\[
\boxed{
\text{有限维连续时间状态系统的时间推进器}
}
\]

下一篇将从简谐振子出发，讨论为什么显式 Euler 会在保守系统上产生结构性失稳，以及如何借助哈密顿形式和辛积分器保持长期动力学结构。
